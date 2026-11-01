
const express = require("express");
const path = require("node:path");
const fs = require("node:fs");
const multer = require("multer");


const { randomUUID } = require("node:crypto");
const {
    getElancoSightings,
    getElancoStatus
} = require("./src/elanco");

const {
    cleanSightings,
    filterSightings,
    isValidDate,
    validateReport,
    countByLocation,
    countByPeriod
} = require("./src/sightings");

const {
    getSavedSightings,
    saveSighting
} = require("./src/storage");

const app = express();
const PORT = process.env.PORT || 3000;

// IMAGE UPLOADS

// Save uploaded pictures inside the backend folder
const uploadsPath = path.join(__dirname, "uploads");

// Create the folder automatically if it doesn't exist
fs.mkdirSync(uploadsPath, { recursive: true });

// These are the image types we'll accept
const imageExtensions = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp"
};

// Decide where and how each picture should be saved
const imageStorage = multer.diskStorage({

    destination: uploadsPath,

    filename: (req, file, callback) => {

        // Use a unique name so pictures don't overwrite each other
        const extension = imageExtensions[file.mimetype];

        callback(null, `${randomUUID()}${extension}`);
    }
});

// Set the upload rules
const upload = multer({

    storage: imageStorage,

    limits: {
        fileSize: 5 * 1024 * 1024, // Maximum 5 MB
        files: 1,
        fields: 10
    },

    fileFilter: (req, file, callback) => {

        // Don't accept files outside our supported image types
        if (!Object.hasOwn(imageExtensions, file.mimetype)) {

            const error = new Error(
                "Only JPG, PNG and WebP images are allowed."
            );

            error.statusCode = 400;

            return callback(error);
        }

        callback(null, true);
    }
});

// Let the server read JSON requests
app.use(express.json());
// Check that our backend is running
app.get("/api/health", (req, res) => {
    res.json({
        message: "Elanco Tick Tracker backend is working!"
    });
});


// GET ALL SIGHTINGS

// Get both Elanco and community sightings in one place
async function getAllSightings() {

    let elanco;

    try {

        // Get the sightings from Elanco
        elanco = await getElancoSightings();

    } catch (error) {

        console.error("Elanco API failed:", error.message);

        // Return a 502 if we can't get Elanco's data
        const failure = new Error("Unable to retrieve Elanco sightings");
        failure.statusCode = 502;
        throw failure;
    }

    let saved;

    try {

        // Get the reports people have submitted
        saved = await getSavedSightings();

    } catch (error) {

        console.error("Reading sightings failed:", error.message);

        // This is our storage problem, not Elanco's
        const failure = new Error("Unable to read saved sightings");
        failure.statusCode = 500;
        throw failure;
    }

    // Only take community reports from our JSON file
    // We already get Elanco's sightings from their API
    const community = saved.filter(
        sighting => sighting && sighting.source === "community"
    );

    // Put both together and remove duplicates or bad records
    const { sightings } = cleanSightings([
        ...elanco,
        ...community
    ]);

    return sightings;
}



// Give the reporting form the available tick species
app.get("/api/species", async (req, res) => {

    try {
        // Use the data we already fetch and cache from Elanco
        const sightings = await getElancoSightings();

        // Get each species name only once
        const species = [...new Set(
            sightings
                .map(sighting => sighting.species)
                .filter(name =>
                    typeof name === "string" && name.trim()
                )
                .map(name => name.trim())
        )]
            .filter(name => name.toLowerCase() !== "unknown")
            .sort();

        res.json(species);

    } catch (error) {

        console.error("Species loading failed:", error.message);

        res.status(502).json({
            error: "Unable to load species."
        });
    }
});


// GET SIGHTINGS

app.get("/api/sightings", async (req, res) => {

    // Default to page 1 with 20 sightings
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 20);

    const { location, startDate, endDate } = req.query;

    // Don't allow invalid page numbers or huge requests
    if (!Number.isSafeInteger(page) || page < 1 ||
        !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {

        return res.status(400).json({
            error: "Invalid page or limit"
        });
    }

    // Make sure the location makes sense
    if (location !== undefined &&
        (typeof location !== "string" ||
         !location.trim() || location.length > 100)) {

        return res.status(400).json({
            error: "Invalid location"
        });
    }

    // Check that the dates are real dates
    if ((startDate !== undefined && !isValidDate(startDate)) ||
        (endDate !== undefined && !isValidDate(endDate))) {

        return res.status(400).json({
            error: "Dates must be in YYYY-MM-DD format"
        });
    }

    // The start date can't be later than the end date
    if (startDate && endDate && startDate > endDate) {

        return res.status(400).json({
            error: "Start date cannot be after end date"
        });
    }

    try {

        const sightings = await getAllSightings();

        // Only keep sightings that match the search
        const filtered = filterSightings(
            sightings,
            location?.trim(),
            startDate,
            endDate
        );

        // Put the newest sightings first
        const sorted = [...filtered].sort(
            (a, b) => Date.parse(b.date) - Date.parse(a.date)
        );

        // Work out where this page starts
        const start = (page - 1) * limit;

        // Only send the sightings for the requested page
       res.json({
    total: sorted.length,
    page,
    limit,
    sightings: sorted.slice(start, start + limit),

    // Tell the frontend when Elanco's data is outdated
    warning: getElancoStatus().warning
});

    } catch (error) {

        if (!error.statusCode) {
            console.error("Getting sightings failed:", error.message);
        }

        // Send back the right error without crashing
        res.status(error.statusCode || 500).json({
            error: error.statusCode
                ? error.message
                : "Unable to retrieve sightings"
        });
    }
});



   // POST SIGHTING

// Receive the form fields and one optional image
app.post("/api/sightings", upload.single("image"), async (req, res) => {

    // Delete an uploaded image if the report cannot be saved
    async function removeUploadedImage() {

        if (!req.file) {
            return;
        }

        try {
            await fs.promises.unlink(req.file.path);
        } catch (error) {
            console.error("Image cleanup failed:", error.message);
        }
    }

    try {

        // Multer puts the form fields into req.body
        const report = req.body || {};
      

        // Let our existing backend validation check the report
        const validationError = validateReport(report);

        if (validationError) {

            // Don't keep the image if the form is invalid
            await removeUploadedImage();

            return res.status(400).json({
                error: validationError
            });
        }

        const { date, time, location, species } = report;

        // Create the new sighting
        const sighting = {
            id: randomUUID(),
            date: `${date}T${time}:00`,
            location: location.trim(),
            species: species.trim(),
            latinName: null,
            source: "community",

            // Store the image URL, not the actual image in JSON
            imagePath: req.file
                ? `/uploads/${req.file.filename}`
                : null
        };

        // Save the report using our existing JSON storage function
        await saveSighting(sighting);

        return res.status(201).json({
            message: "Sighting reported successfully!",
            sighting
        });

    } catch (error) {

        // If validation or saving crashes, don't leave an orphan image
        await removeUploadedImage();

        console.error("Sighting submission failed:", error.message);

        return res.status(500).json({
            error: "Unable to save sighting."
        });
    }
});
// REGIONAL STATISTICS

app.get("/api/insights/regions", async (req, res) => {

    try {

        // Use the same cleaned data as our other endpoints
        const sightings = await getAllSightings();

        // Count how many sightings each city has
        res.json(countByLocation(sightings));

    } catch (error) {

        if (!error.statusCode) {
            console.error("Region counts failed:", error.message);
        }

        res.status(error.statusCode || 500).json({
            error: error.statusCode
                ? error.message
                : "Unable to calculate region counts"
        });
    }
});


// WEEKLY AND MONTHLY TRENDS

app.get("/api/insights/trends", async (req, res) => {

    // Use monthly unless someone asks for weekly
    const period = req.query.period || "monthly";

    // We only support these two options
    if (period !== "weekly" && period !== "monthly") {

        return res.status(400).json({
            error: "Period must be weekly or monthly"
        });
    }

    try {

        const sightings = await getAllSightings();

        // Group the sightings by week or month
        res.json(countByPeriod(sightings, period));

    } catch (error) {

        if (!error.statusCode) {
            console.error("Trends failed:", error.message);
        }

        res.status(error.statusCode || 500).json({
            error: error.statusCode
                ? error.message
                : "Unable to calculate trends"
        });
    }
});


// SERVE FRONTEND FILES


// Let the browser view uploaded tick pictures
app.use("/uploads", express.static(uploadsPath));


// Our HTML and JavaScript files are one folder above backend
const frontendPath = path.join(__dirname, "..");

// Let the browser load our Tailwind CSS
app.use("/css", express.static(
    path.join(frontendPath, "css")
));

// Let the browser load our tick pictures and illustrations
app.use("/images", express.static(
    path.join(frontendPath, "images")
));

// Open the main website at localhost:3000
app.get(["/", "/index.html"], (req, res) => {

    res.sendFile(
        path.join(frontendPath, "index.html")
    );
});

// Serve the other frontend files without exposing backend files
const frontendFiles = [
    "main.js",
    "report.html",
    "report.js",
    "species-guide.js"
];

for (const file of frontendFiles) {

    app.get(`/${file}`, (req, res) => {

        res.sendFile(
            path.join(frontendPath, file)
        );
    });
}


// ERROR HANDLING

app.use((err, req, res, next) => {

    // Handle image upload errors
    if (err instanceof multer.MulterError) {

        // The image is larger than 5 MB
        if (err.code === "LIMIT_FILE_SIZE") {
            return res.status(413).json({
                error: "The image must be 5 MB or smaller."
            });
        }

        return res.status(400).json({
            error: "Invalid image upload."
        });
    }

    
// Handle invalid JSON requests first
if (err.type === "entity.parse.failed") {
    return res.status(400).json({
        error: "Invalid JSON format."
    });
}

// Handle unsupported image formats
if (err.statusCode === 400) {
    return res.status(400).json({
        error: err.message
    });
}


    // Handle any other unexpected errors
    console.error("Request failed:", err.message);

    return res.status(500).json({
        error: "Something went wrong."
    });
});


// START SERVER

app.listen(PORT, () => {

    console.log(`Server running at http://localhost:${PORT}`);
});
