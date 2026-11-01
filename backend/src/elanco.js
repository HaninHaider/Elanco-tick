
const { cleanSightings } = require("./sightings");

const API_URL = process.env.ELANCO_API_URL ||
    "https://dev-task.elancoapps.com/data/tick-sightings";

const CACHE_MS = 5 * 60 * 1000;
const RETRY_MS = 60 * 1000;
const MAX_STALE_MS = 24 * 60 * 60 * 1000;

let cachedSightings = null;
let lastFetched = 0;
let fetchingSightings = null;
let retryAfter = 0;
let dataWarning = null;

async function getElancoSightings() {

    const now = Date.now();

    // Use fresh cached data for five minutes
    if (
        cachedSightings !== null &&
        now - lastFetched < CACHE_MS
    ) {
        return cachedSightings;
    }

    // Don't keep retrying every second during an outage
    if (
        cachedSightings !== null &&
        now < retryAfter
    ) {
        return cachedSightings;
    }

    // Share the same request if one is already running
    if (fetchingSightings) {
        return fetchingSightings;
    }

    fetchingSightings = (async () => {

        try {
            // Stop waiting if the API takes too long
            const response = await fetch(API_URL, {
                signal: AbortSignal.timeout(15000)
            });

            if (!response.ok) {
                throw new Error(
                    `Elanco API returned HTTP ${response.status}`
                );
            }

            // Invalid JSON will also be caught below
            const data = await response.json();

            if (!Array.isArray(data)) {
                throw new Error("Invalid Elanco API response");
            }

            // Remove duplicate and incomplete records
            const { sightings, duplicates, invalid } =
                cleanSightings(data);

            // Don't replace good cached data with an unusable response
            if (data.length > 0 && sightings.length === 0) {
                throw new Error("No valid sightings received");
            }

            // Save the latest successful result
            cachedSightings = sightings;
            lastFetched = Date.now();
            retryAfter = 0;
            dataWarning = null;

            console.log(`Loaded ${sightings.length} sightings`);
            console.log(
                `Skipped ${duplicates} duplicates and ${invalid} invalid records`
            );

            return sightings;

        } catch (error) {

            console.error("Elanco API failed:", error.message);

            // Use our earlier data if it isn't too old
            if (
                cachedSightings !== null &&
                Date.now() - lastFetched <= MAX_STALE_MS
            ) {
                retryAfter = Date.now() + RETRY_MS;

                dataWarning =
                    "Elanco's live data is temporarily unavailable. " +
                    "Showing previously loaded sightings, which may be outdated.";

                console.warn("Using cached Elanco sightings");

                return cachedSightings;
            }

            // No usable cache: let server.js return the 502 error
            throw error;
        }

    })();

    try {
        return await fetchingSightings;

    } finally {
        // Allow another request after this one finishes
        fetchingSightings = null;
    }
}

// Let the API tell the frontend if data is outdated
function getElancoStatus() {
    return {
        warning: dataWarning,
        lastUpdated: lastFetched
            ? new Date(lastFetched).toISOString()
            : null
    };
}

module.exports = {
    getElancoSightings,
    getElancoStatus
};
