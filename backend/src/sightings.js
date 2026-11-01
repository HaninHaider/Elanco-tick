
function isValidDate(value) {

    // Check the date follows YYYY-MM-DD
    if (typeof value !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return false;
    }

    const date = new Date(`${value}T00:00:00Z`);

    // Make sure it's a real date, not something like 30 February
    return !Number.isNaN(date.getTime()) &&
        date.toISOString().slice(0, 10) === value;
}


function cleanSightings(data) {

    // Keep track of IDs so we don't count the same record twice
    const seenIds = new Set();
    const sightings = [];

    let duplicates = 0;
    let invalid = 0;

    for (const sighting of data) {

        // Skip records with missing or invalid information
        if (!sighting ||
            typeof sighting.id !== "string" ||
            !sighting.id.trim() ||
            typeof sighting.date !== "string" ||
            !isValidDate(sighting.date.slice(0, 10)) ||
            !Number.isFinite(Date.parse(sighting.date)) ||
            typeof sighting.location !== "string" ||
            !sighting.location.trim() ||
            typeof sighting.species !== "string" ||
            !sighting.species.trim()) {

            invalid++;
            continue;
        }

        const id = sighting.id.trim();

        // Skip the record if we've already seen its ID
        if (seenIds.has(id)) {
            duplicates++;
            continue;
        }

        // Remember this ID for the next records
        seenIds.add(id);

        // Keep the record and remove extra spaces
        const cleaned = {
            ...sighting,
            id,
            location: sighting.location.trim(),
            species: sighting.species.trim()
        };

        sightings.push(cleaned);
    }

    return { sightings, duplicates, invalid };
}


function filterSightings(sightings, location, startDate, endDate) {

    return sightings.filter(sighting => {

        // Ignore capital letters when searching locations
        if (location &&
            !sighting.location.toLowerCase().includes(location.toLowerCase())) {
            return false;
        }

        // We only need the date, not the time
        const date = sighting.date.slice(0, 10);

        // Skip anything before the start date
        if (startDate && date < startDate) {
            return false;
        }

        // Skip anything after the end date
        if (endDate && date > endDate) {
            return false;
        }

        return true;
    });
}


function validateReport(report) {

    // Make sure we actually received a report object
    if (!report || typeof report !== "object" || Array.isArray(report)) {
        return "Invalid report";
    }

    const { date, time, location, species } = report;

    // Check the date
    if (!isValidDate(date)) {
        return "Please enter a valid date";
    }
    // A reported sighting can't happen in the future
const today = new Date();
const localToday = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0")
].join("-");

if (date > localToday) {
    return "Sighting date cannot be in the future";
}

    // Time needs to be in 24-hour format, like 14:30
    if (typeof time !== "string" ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
        return "Please enter a valid time";
    }
    

    // Don't accept empty or excessively long locations
    if (typeof location !== "string" ||
        !location.trim() || location.length > 100) {
        return "Please enter a valid location";
    }

    // Make sure a species was entered
    if (typeof species !== "string" ||
        !species.trim() || species.length > 100) {
        return "Please enter a valid species";
    }

    // No errors found
    return null;
}



function countByLocation(sightings) {

    const counts = new Map();

    for (const sighting of sightings) {

        // Ignore capital letters when grouping the same location
        const key = sighting.location.trim().toLowerCase();

        if (counts.has(key)) {

            counts.get(key).count++;

        } else {

            // Keep the original name for display
            counts.set(key, {
                location: sighting.location.trim(),
                count: 1
            });
        }
    }

    // Show the locations with the most sightings first
    return [...counts.values()]
        .sort((a, b) => b.count - a.count);
}


function countByPeriod(sightings, period) {

    const counts = new Map();

    for (const sighting of sightings) {

        // We only need the date for our statistics
        const date = sighting.date.slice(0, 10);
        let key;

        if (period === "weekly") {

            // Work out which Monday this date belongs to
            const monday = new Date(`${date}T00:00:00Z`);
            const day = monday.getUTCDay();

            monday.setUTCDate(
                monday.getUTCDate() - ((day + 6) % 7)
            );

            // Use the Monday's date to represent the whole week
            key = monday.toISOString().slice(0, 10);

        } else {

            // Use just the year and month, like 2026-10
            key = date.slice(0, 7);
        }

        // Count how many sightings belong to this week or month
        counts.set(key, (counts.get(key) || 0) + 1);
    }

    // Put the results in date order for the charts
    return Array.from(counts, ([period, count]) => ({
        period,
        count
    })).sort((a, b) => a.period.localeCompare(b.period));
}


module.exports = {
    cleanSightings,
    filterSightings,
    isValidDate,
    validateReport,
    countByLocation,
    countByPeriod
};
