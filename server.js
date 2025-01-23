
const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const archiver = require("archiver");
const sharp = require("sharp");

const app = express();
const uploadDir = path.join(__dirname, "uploads");
const outputDir = path.join(__dirname, "output");

// Create directories if they don't exist
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

// Multer configuration for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}-${file.originalname}`;
        cb(null, uniqueName);
    },
});
const upload = multer({ storage });

// Helper function to safely delete files
const safeDeleteFile = (filePath) => {
    setTimeout(() => {
        fs.unlink(filePath, (err) => {
            if (err) {
                console.error(`Failed to delete ${filePath}:`, err.message);
            } else {
                console.log(`Deleted: ${filePath}`);
            }
        });
    }, 500); // Delay to avoid file lock issues
};

// Serve the frontend file
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "/front end/photo-enhancer.html"));
});

// Image processing endpoint
app.post("/process-images", upload.array("images"), async (req, res) => {
    const processType = req.body.processType;
    const files = req.files;

    if (!files || files.length === 0) {
        return res.status(400).json({ message: "No files uploaded." });
    }

    console.log(`Processing ${files.length} files...`);

    const processedFiles = [];

    for (const file of files) {
        const processedFilePath = path.join(outputDir, `processed-${file.filename}`);

        try {
            console.log("Processing file:", file.filename);
            console.log("Original file path:", file.path);
            console.log("Processed file path:", processedFilePath);

            // Process the image based on type
            if (processType === "sharpen") {
                console.log(`Applying sharpen to: ${file.filename}`);
                await sharp(file.path).sharpen().toFile(processedFilePath);
            } else if (processType === "enhance") {
                console.log(`Enhancing: ${file.filename}`);
                await sharp(file.path)
                    .modulate({ brightness: 1.2, contrast: 1.1 })
                    .toFile(processedFilePath);
            } else {
                console.error("Invalid process type:", processType);
                return res.status(400).json({ message: "Invalid process type." });
            }

            // Check if the processed file exists
            if (!fs.existsSync(processedFilePath)) {
                console.error(`Processed file not created: ${processedFilePath}`);
                return res.status(500).json({ message: "Processed file not found." });
            }

            processedFiles.push({
                original: file.path,
                processed: processedFilePath,
            });

            console.log(`Successfully processed: ${file.filename}`);
        } catch (error) {
            console.error("Error processing image:", error);
            return res.status(500).json({ message: "Error processing images." });
        }
    }

    // Create a zip file for the processed images
    const zipFileName = `processed-${Date.now()}.zip`;
    const zipFilePath = path.join(outputDir, zipFileName);
    const archive = archiver("zip", { zlib: { level: 9 } });
    const output = fs.createWriteStream(zipFilePath);

    archive.pipe(output);

    processedFiles.forEach((file) => {
        archive.file(file.processed, { name: path.basename(file.processed) });
    });

    try {
        await archive.finalize();
        console.log(`Zip file created: ${zipFilePath}`);
    } catch (error) {
        console.error("Error creating zip file:", error);
        return res.status(500).json({ message: "Error creating zip file." });
    }

    // Clean up original and processed files
    files.forEach((file) => safeDeleteFile(file.path));
    processedFiles.forEach((file) => safeDeleteFile(file.processed));

    res.json({ zipUrl: `/output/${zipFileName}` });
});

// Serve static files from the output directory
app.use("/output", express.static(outputDir));

// Start the server
const PORT = 4000;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
