const express = require('express');
const multer = require('multer');
const mongoose = require('mongoose');
const path = require('path');
const { nanoid } = require('nanoid');
const cors = require('cors');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const axios = require('axios'); // Import axios
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

// --- 4. DATABASE SCHEMA ---
const fileSchema = new mongoose.Schema({
    shortId: { type: String, required: true, unique: true },
    originalName: String,
    fileUrl: { type: String, required: true },
    mimeType: String,
    cloudinaryId: String,
    createdAt: { type: Date, default: Date.now },
});
const File = mongoose.model('File', fileSchema);

// --- 5. MULTER SETUP ---
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'instalink_uploads',
        resource_type: 'auto',
    },
});
const upload = multer({ storage: storage });

// --- 6. API ROUTES ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'instalink.html'));
});

// The UPLOAD route
app.post('/upload', upload.any(), async (req, res) => {
    const file = req.files && req.files.length > 0 ? req.files[0] : null;
    if (!file) {
        return res.status(400).json({ error: 'No file was uploaded.' });
    }
    try {
        const { customName } = req.body;
        let shortId;
        if (customName) {
            const sanitizedName = customName.trim().replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-_]/g, '');
            if (!sanitizedName) {
                return res.status(400).json({ error: 'Custom name contains invalid characters.' });
            }
            const existingFile = await File.findOne({ shortId: sanitizedName });
            if (existingFile) {
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
            fileUrl: file.path,
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

// The VIEW/DOWNLOAD route - **PROPERLY FIXED & MORE ROBUST**
app.get('/file/:shortId', async (req, res) => {
    try {
        const file = await File.findOne({ shortId: req.params.shortId });
        if (!file) {
            return res.status(404).send('<h1>File not found</h1><p>The link may be incorrect or the file has been removed.</p>');
        }

        // Use axios to get the file from Cloudinary as a stream, with a timeout
        const response = await axios({
            method: 'GET',
            url: file.fileUrl,
            responseType: 'stream',
            timeout: 15000 // 15-second timeout
        });

        // Set the correct headers to tell the browser how to handle the file.
        res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${file.originalName}"`);

        // Pipe the file stream from Cloudinary directly to the user's browser
        response.data.pipe(res);

        // Add error handling for the stream itself in case it fails mid-transfer
        response.data.on('error', (streamError) => {
            console.error('Error during file stream from Cloudinary:', streamError);
            if (!res.headersSent) {
                res.status(500).send('<h1>Error during file stream</h1>');
            }
        });

    } catch (error) {
        console.error('Error proxying file:', error);

        // Handle specific network errors like timeouts
        if (error.code === 'ECONNABORTED') {
            return res.status(504).send('<h1>Gateway Timeout</h1><p>The server took too long to retrieve the file from storage.</p>');
        }
        
        // Handle cases where the file is not found on Cloudinary's end
        if (error.response && error.response.status === 404) {
             return res.status(404).send('<h1>File not found on storage</h1><p>The file may have been deleted.</p>');
        }

        // For all other errors, send a generic server error message
        res.status(500).send('<h1>Server error while retrieving file</h1>');
    }
});

// --- 7. START THE SERVER ---
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

