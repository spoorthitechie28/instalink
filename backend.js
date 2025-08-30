const express = require('express');
const multer = require('multer');
const mongoose = require('mongoose');
const path = require('path');
const { nanoid } = require('nanoid');
const cors = require('cors');
require('dotenv').config(); // Loads environment variables from a .env file

const app = express();
const PORT = process.env.PORT || 3000;

// --- IMPORTANT SECURITY NOTE ---
// In a real production app, you should validate file types and sizes
// to prevent users from uploading malicious files or overloading your server.

// --- 1. MIDDLEWARE ---
app.use(cors()); // Allows requests from your frontend
app.use(express.static(path.join(__dirname))); // Serve static files like your HTML

// --- 2. DATABASE CONNECTION ---
// The connection string is now loaded from the .env file
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
    console.error("FATAL ERROR: MONGO_URI is not defined in the .env file.");
    process.exit(1); // Exit the application if the database string is not set
}

mongoose.connect(MONGO_URI)
    .then(() => console.log('MongoDB connected successfully.'))
    .catch(err => console.error('MongoDB connection error:', err));

// --- 3. DATABASE SCHEMA ---
const fileSchema = new mongoose.Schema({
    shortId: {
        type: String,
        required: true,
        unique: true,
    },
    originalName: String,
    // The physical path where the file is stored on the server's disk
    filePath: {
      type: String,
      required: true
    }, 
    mimeType: String,
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

const File = mongoose.model('File', fileSchema);

// --- 4. MULTER SETUP (for file storage) ---
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, './uploads'); // Store files in the 'uploads' directory
    },
    filename: function (req, file, cb) {
        // Use a unique name to prevent file conflicts
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

// --- 5. API ROUTES ---

// Route to serve your main HTML page
app.get('/', (req, res) => {
    // We assume instalink.html is in the same directory as this script
    res.sendFile(path.join(__dirname, 'instalink.html'));
});

// The UPLOAD route
// FIX: Changed from upload.single('file') to upload.any()
// This ensures that both the file and any other text fields (like customName) are correctly processed.
app.post('/upload', upload.any(), async (req, res) => {
    // The file will now be in the `req.files` array
    const file = req.files && req.files.length > 0 ? req.files[0] : null;

    if (!file) {
        return res.status(400).json({ error: 'No file was uploaded.' });
    }

    try {
        // The customName will now be correctly parsed into req.body
        const { customName } = req.body;
        let shortId;

        if (customName) {
            // Sanitize customName to be URL-friendly (allow letters, numbers, -, _)
            const sanitizedName = customName.trim().replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-_]/g, '');

            if (!sanitizedName) {
                return res.status(400).json({ error: 'Custom name contains invalid characters.' });
            }

            // Check if the custom name already exists in the database
            const existingFile = await File.findOne({ shortId: sanitizedName });
            if (existingFile) {
                return res.status(409).json({ error: 'This custom link name is already taken.' });
            }
            shortId = sanitizedName;
        } else {
            // If no custom name, generate a random one
            shortId = nanoid(8);
        }

        const newFile = new File({
            shortId: shortId, // Use the determined shortId (custom or random)
            originalName: file.originalname,
            filePath: file.path,
            mimeType: file.mimetype,
        });

        await newFile.save();

        const shareableLink = `${req.protocol}://${req.get('host')}/file/${newFile.shortId}`;

        res.status(200).json({ link: shareableLink });

    } catch (error) {
        console.error('Error saving file to DB:', error);
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

        // Set the content type header so the browser knows how to display the file
        res.setHeader('Content-Type', file.mimeType);

        // Use res.sendFile to stream the file. This lets the browser view it directly.
        res.sendFile(path.resolve(file.filePath));

    } catch (error) {
        console.error('Error finding file:', error);
        res.status(500).send('<h1>Server error</h1>');
    }
});

// --- 6. START THE SERVER ---
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log("Make sure the 'uploads' folder exists in this directory.");
});

