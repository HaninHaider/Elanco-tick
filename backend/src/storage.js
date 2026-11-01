
const fs = require("node:fs/promises");
const path = require("node:path");

// Where we keep the reports people submit
const FILE = path.join(__dirname, "../data/sightings.json");
const TEMP_FILE = `${FILE}.tmp`;


// READ SAVED SIGHTINGS

async function getSavedSightings() {

    let content;

    try {
        // Try reading the reports we already have
        content = await fs.readFile(FILE, "utf8");

    } catch (error) {

        // Only create a new file if it doesn't exist
        if (error.code !== "ENOENT") {
            throw error;
        }

        // Make sure the data folder exists
        await fs.mkdir(path.dirname(FILE), { recursive: true });

        try {
            // Start with an empty list of reports
            // wx stops us overwriting an existing file
            await fs.writeFile(FILE, "[]", {
                encoding: "utf8",
                flag: "wx"
            });

        } catch (createError) {

            // Another request might have created it already
            if (createError.code !== "EEXIST") {
                throw createError;
            }
        }

        // Read the file again now that it exists
        content = await fs.readFile(FILE, "utf8");
    }

    // Turn the JSON into a JavaScript array
    const sightings = JSON.parse(content);

    // Make sure the file actually contains a list
    if (!Array.isArray(sightings)) {
        throw new Error("Sightings file must contain a list");
    }

    return sightings;
}


// SAVE NEW SIGHTINGS

// Keep saves in order so two reports don't overwrite each other
let pendingWrite = Promise.resolve();

function saveSighting(sighting) {

    const operation = pendingWrite.then(async () => {

        // Get the reports we already have
        const sightings = await getSavedSightings();

        // Add the new report to the list
        sightings.push(sighting);

        // Write the updated data to a temporary file first
        await fs.writeFile(
            TEMP_FILE,
            JSON.stringify(sightings, null, 2),
            "utf8"
        );

        // Replace the old file once the new one is ready
        await fs.rename(TEMP_FILE, FILE);
    });

    // Keep the queue working even if one save fails
    pendingWrite = operation.catch(() => {});

    return operation;
}


// Let server.js use these functions
module.exports = {
    getSavedSightings,
    saveSighting
};
