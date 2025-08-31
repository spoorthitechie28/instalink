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
    console.error("FATAL ERROR: MONGO_URI is not defined.");
    process.exit(1);
}
mongoose.connect(MONGO_URI)
    .then(() => console.log('MongoDB connected successfully.'))
    .catch(err => console.error('MongoDB connection error:', err));

// --- 4. DATABASE SCHEMA - UPDATED ---
const fileSchema = new mongoose.Schema({
    shortId: { type: String, required: true, unique: true },
    originalName: String,
    fileUrl: { type: String, required: true },
    cloudinaryId: String,
    resourceType: { type: String, required: true },
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

// The UPLOAD route - FINAL, ROBUST VERSION
app.post('/upload', upload.any(), async (req, res, next) => {
    try {
        const file = req.files && req.files.length > 0 ? req.files[0] : null;
        if (!file) { return res.status(400).json({ error: 'No file was uploaded.' }); }
        const { customName } = req.body;
        let shortId;
        if (customName) {
            const sanitizedName = customName.trim().replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-_]/g, '');
            if (!sanitizedName) { return res.status(400).json({ error: 'Custom name contains invalid characters.' });}
            const existingFile = await File.findOne({ shortId: sanitizedName });
            if (existingFile) {
                await cloudinary.uploader.destroy(file.filename);
                return res.status(409).json({ error: 'This custom link name is already taken.' });
            }
            shortId = sanitizedName;
        } else {
            shortId = nanoid(8);
        }
        
        // **DEFINITIVE FIX:** Determine the resource type by inspecting the final URL from Cloudinary.
        // This is 100% reliable and prevents the server crash.
        let resourceType;
        if (file.path.includes('/raw/upload')) {
            resourceType = 'raw';
        } else if (file.path.includes('/video/upload')) {
            resourceType = 'video';
        } else {
            resourceType = 'image'; // Default to image if not raw or video
        }

        const newFile = new File({
            shortId: shortId,
            originalName: file.originalname,
            fileUrl: file.path,
            cloudinaryId: file.filename,
            resourceType: resourceType, // <-- Save the GUARANTEED correct type
        });
        await newFile.save();
        const shareableLink = `${process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`}/file/${newFile.shortId}`;
        res.status(200).json({ link: shareableLink });
    } catch (error) {
        next(error);
    }
});

// The VIEW/DOWNLOAD route - No changes needed, it's already correct
app.get('/file/:shortId', async (req, res, next) => {
    try {
        const file = await File.findOne({ shortId: req.params.shortId });
        if (!file) { return res.status(404).send('<h1>File not found</h1>'); }

        const downloadUrl = cloudinary.url(file.cloudinaryId, {
            resource_type: file.resourceType,
            flags: ['attachment']
        });
        
        res.redirect(302, downloadUrl);
    } catch (error) {
        next(error);
    }
});

// --- 7. GLOBAL ERROR HANDLER ---
app.use((err, req, res, next) => {
    console.error("An unhandled error occurred:", err.message);
    res.status(500).json({ error: 'An unexpected server error occurred.' });
});

// --- 8. START THE SERVER ---
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

