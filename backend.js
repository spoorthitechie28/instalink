const express = require('express');
const multer = require('multer');
const mongoose = require('mongoose');
const path = require('path');
const { nanoid } = require('nanoid');
const cors = require('cors');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// --- 1. CONFIGURE CLOUDINARY ---
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

// --- 2. MIDDLEWARE ---
app.use(cors());
app.use(express.static(path.join(__dirname)));

// --- 3. DATABASE CONNECTION ---
const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
    console.error("FATAL ERROR: MONGO_URI is not defined in the .env file.");
    process.exit(1);
}
mongoose.connect(MONGO_URI)
    .then(() => console.log('MongoDB connected successfully.'))
    .catch(err => console.error('MongoDB connection error:', err));

// --- 4. DATABASE SCHEMA (Updated to store URL) ---
const fileSchema = new mongoose.Schema({
    shortId: { type: String, required: true, unique: true },
    originalName: String,
    fileUrl: { type: String, required: true },
    mimeType: String,
    cloudinaryId: String,
    createdAt: { type: Date, default: Date.now },
});
const File = mongoose.model('File', fileSchema);

// --- 5. MULTER SETUP (To upload to Cloudinary) ---
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'instalink_uploads',
        // FIX: Set resource_type to 'auto'. This tells Cloudinary to automatically
        // detect the file type (e.g., image, video, or raw for files like PDFs)
        // and handle it correctly. This is the key to fixing the PDF error.
        resource_type: 'auto',
    },
});
const upload = multer({ storage: storage });

// --- 6. API ROUTES ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'instalink.html'));
});

// The UPLOAD route
// CORRECTED: Switched from upload.single('file') to upload.any()
// This is more robust and ensures both the file and text fields are parsed correctly.
app.post('/upload', upload.any(), async (req, res) => {
    // The file will be in the `req.files` array
    const file = req.files && req.files.length > 0 ? req.files[0] : null;

    if (!file) {
        return res.status(400).json({ error: 'No file was uploaded.' });
    }

    try {
        // The customName from the form will now be correctly available in req.body
        const { customName } = req.body;
        let shortId;

        if (customName) {
            const sanitizedName = customName.trim().replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-_]/g, '');
            if (!sanitizedName) {
                return res.status(400).json({ error: 'Custom name contains invalid characters.' });
            }
            const existingFile = await File.findOne({ shortId: sanitizedName });
            if (existingFile) {
                // Important: Delete the file just uploaded to Cloudinary since the name is taken
                await cloudinary.uploader.destroy(file.filename);
                return res.status(409).json({ error: 'This custom link name is already taken.' });
            }
            shortId = sanitizedName;
        } else {
            shortId = nanoid(8);
        }

        const newFile = new File({
            shortId: shortId,
            originalName: file.originalname,
            fileUrl: file.path, // multer-storage-cloudinary provides the URL in `req.file.path`
            mimeType: file.mimetype,
            cloudinaryId: file.filename,
        });

        await newFile.save();

        const shareableLink = `${process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`}/file/${newFile.shortId}`;
        res.status(200).json({ link: shareableLink });

    } catch (error) {
        console.error('Error during upload:', error);
        res.status(500).json({ error: 'Server error while creating link.' });
    }
});

// The VIEW/DOWNLOAD route
app.get('/file/:shortId', async (req, res) => {
    try {
        const file = await File.findOne({ shortId: req.params.shortId });
        if (!file) {
            return res.status(404).send('<h1>File not found</h1><p>The link may be incorrect or the file has been removed.</p>');
        }
        res.redirect(file.fileUrl);
    } catch (error) {
        console.error('Error finding file:', error);
        res.status(500).send('<h1>Server error</h1>');
    }
});

// --- 7. START THE SERVER ---
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

