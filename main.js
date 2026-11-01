
// Use MapLibre for the map and its city markers
import {
    Map as MapLibreMap,
    Marker,
    Popup
} from "https://unpkg.com/maplibre-gl@6.16.0/dist/maplibre-gl.mjs";


// MAP SETUP

// The locations are city centres, not the exact places ticks were found
const cityCoordinates = {
    birmingham: [-1.8904, 52.4862],
    bristol: [-2.5879, 51.4545],
    cardiff: [-3.1791, 51.4816],
    edinburgh: [-3.1883, 55.9533],
    glasgow: [-4.2518, 55.8642],
    leeds: [-1.5491, 53.8008],
    leicester: [-1.1398, 52.6369],
    liverpool: [-2.9916, 53.4084],
    london: [-0.1278, 51.5074],
    manchester: [-2.2426, 53.4808],
    newcastle: [-1.6178, 54.9783],
    nottingham: [-1.1492, 52.9548],
    sheffield: [-1.4701, 53.3811],
    southampton: [-1.4044, 50.9097]
};

const map = new MapLibreMap({
    container: "map",
    style: "https://tiles.openfreemap.org/styles/liberty",
    center: [-3.5, 54.5],
    zoom: 6
});

let displayedMarkers = [];

// Keep the map fitted to its container when the layout changes
const mapElement = document.getElementById("map");

const mapResizeObserver = new ResizeObserver(() => {
    map.resize();
});

mapResizeObserver.observe(mapElement);


// PAGE ELEMENTS

const dateDropdown = document.getElementById("dateFilter");
const speciesDropdown = document.getElementById("speciesFilter");
const activityDropdown = document.getElementById("activityFilter");
const filterStatus = document.getElementById("filterStatus");
const resultsList = document.getElementById("resultsList");
const chartCity = document.getElementById("chartCity");
const chartYear = document.getElementById("chartYear");
const chartStatus = document.getElementById("chartStatus");

const SIGHTINGS_URL = "/api/sightings";
const PAGE_SIZE = 100; // Our backend allows up to 100 at a time
const RESULTS_PER_BATCH = 30;

// The top filters will also refresh the chart
let refreshSeasonalChart = () => { };


// GET SIGHTINGS FROM OUR BACKEND

async function loadSightings() {
    const allSightings = [];
    let page = 1;

    try {
        while (true) {
            // Get the next page instead of expecting one big array
            const response = await fetch(
                `${SIGHTINGS_URL}?page=${page}&limit=${PAGE_SIZE}`,
                { cache: "no-store" }
            );

            if (!response.ok) {
                const details = await response.json().catch(() => ({}));
                throw new Error(details.error || `API request failed (${response.status})`);
            }

            const data = await response.json();
            // Warn users if the backend is showing older data
            if (data.warning) {
                const warning = document.getElementById("dataWarning");

                if (warning) {
                    warning.textContent = data.warning;
                    warning.classList.remove("hidden");
                }
            }

            // The backend returns the sightings inside an object
            if (!data || !Array.isArray(data.sightings) ||
                !Number.isSafeInteger(data.total) || data.total < 0) {
                throw new Error("Unexpected response from our backend");
            }

            allSightings.push(...data.sightings);

            // Stop when we've reached the last page
            if (data.sightings.length === 0 || allSightings.length >= data.total) {
                break;
            }

            page++;
        }

        console.log(`Loaded ${allSightings.length} sightings`);
        return allSightings;

    } catch (error) {
        console.error("Could not load tick sightings:", error);
        return null;
    }
}


// SMALL HELPERS
// Match the common tick names to their scientific names
const speciesLatinNames = {
    "fox/badger tick": "Ixodes canisuga",
    "marsh tick": "Ixodes apronophorus",
    "passerine tick": "Ixodes frontalis",
    "southern rodent tick": "Ixodes acuminatus",
    "tree-hole tick": "Ixodes arboricola",
    "ixodes ricinus": "Ixodes ricinus"
};

function cityKey(location) {
    return location.trim().toLowerCase();
}

function cityLabel(city) {
    return city.charAt(0).toUpperCase() + city.slice(1);
}
// Use the correct singular or plural wording
function sightingCount(count) {
    return `${count} sighting${count === 1 ? "" : "s"}`;
}

function formatDate(value) {
    // Use the date part, so time zones don't change the displayed day
    const [year, month, day] = value.slice(0, 10).split("-");
    return `${day}/${month}/${year}`;
}

function isRecent(value) {
    // A Recent badge means the report was made within the last 30 days
    const date = Date.parse(`${value.slice(0, 10)}T00:00:00Z`);
    const age = Date.now() - date;
    return age >= 0 && age <= 30 * 24 * 60 * 60 * 1000;
}

function makeElement(tag, className, text) {
    const element = document.createElement(tag);
    element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
}


// ACTIVITY COLOURS

// Work out the activity using the city's actual sighting count
function getActivityLevel(count, lowLimit, highLimit) {

    // Cities with the lowest sighting counts
    if (count <= lowLimit) {
        return {
            name: "low",
            colour: "bg-green-700",
            textColour: "text-white"
        };
    }

    // Cities with counts in the middle
    if (count <= highLimit) {
        return {
            name: "medium",
            colour: "bg-yellow-500",
            textColour: "text-gray-900"
        };
    }

    // Cities with the highest sighting counts
    return {
        name: "high",
        colour: "bg-red-600",
        textColour: "text-white"
    };
}


// CLEAR OLD MARKERS

function clearMarkers() {
    // Remove the previous city's markers when filters change
    for (const marker of displayedMarkers) marker.remove();
    displayedMarkers = [];

    document.getElementById("sightingPanel").classList.add("hidden");
    document.getElementById("sightingPrompt").classList.remove("hidden");
}


// DISPLAY SIGHTINGS ON THE MAP

function displaySightings(sightings, selectedActivity = "all") {
    clearMarkers();

    const cityCounts = new Map();

    // Count sightings for each city on the map
    for (const sighting of sightings) {
        const city = cityKey(sighting.location);

        if (!cityCoordinates[city]) continue;

        cityCounts.set(
            city,
            (cityCounts.get(city) || 0) + 1
        );
    }

    // Keep the activity levels for the map and results sidebar
    const shownCities = new Map();

    // No matching sightings means there are no markers to show
    if (cityCounts.size === 0) return shownCities;

    // Sort city counts and use them to split the cities into thirds
    const counts = [...cityCounts.values()].sort((a, b) => a - b);

    const lowLimit = counts[Math.floor(counts.length / 3)];
    const highLimit = counts[Math.floor(counts.length * 2 / 3)];

    // Create a marker for each city that matches the activity filter
    for (const [city, count] of cityCounts) {

        const activity = getActivityLevel(
            count,
            lowLimit,
            highLimit
        );

        // Decide the colour before filtering, so it stays consistent
        if (selectedActivity !== "all" &&
            selectedActivity !== activity.name) {
            continue;
        }

        shownCities.set(city, activity);

        // Create a marker with its sighting count
        const button = makeElement(
            "button",
            `flex h-9 min-w-9 cursor-pointer items-center
             justify-center rounded-full border-2 border-white
             px-1 text-xs font-bold shadow
             ${activity.colour} ${activity.textColour}`,
            String(count)
        );

        button.type = "button";

        button.setAttribute(
            "aria-label",
            `${count} reported sightings in ${cityLabel(city)}, ${activity.name} relative activity`
        );

        // Clicking a marker opens that city's details
        button.addEventListener("click", () => {
            showCityDetails(city, sightings);
        });

        const popup = new Popup({ offset: 25 }).setText(
            `${cityLabel(city)}: ${count} reported sightings ` +
            `(${activity.name} relative activity; approximate city centre)`
        );

        const marker = new Marker({ element: button })
            .setLngLat(cityCoordinates[city])
            .setPopup(popup)
            .addTo(map);

        displayedMarkers.push(marker);
    }

    return shownCities;
}


// SIDEBAR RESULTS

function createResultCard(sighting, activity, matchingSightings) {
    const city = cityKey(sighting.location);

    const card = makeElement(
        "button",
        `w-full rounded-xl border-2 border-[#173B70]
         bg-white p-3 text-left hover:bg-blue-50
         focus-visible:outline-2 focus-visible:outline-blue-500`
    );

    card.type = "button";
    card.setAttribute(
        "aria-label",
        `View ${sighting.species} sighting in ${cityLabel(city)} on ${formatDate(sighting.date)}`
    );

    const top = makeElement(
        "div",
        "flex flex-wrap items-center gap-2"
    );

    // Match the sidebar dot colour to the map marker
    const dot = makeElement(
        "span",
        `h-3 w-3 shrink-0 rounded-full ${activity.colour}`
    );

    dot.setAttribute("aria-hidden", "true");

    top.appendChild(dot);

    top.appendChild(makeElement(
        "span",
        "font-semibold text-gray-900",
        cityLabel(city)
    ));

    // Show the tick species
    top.appendChild(makeElement(
        "span",
        "max-w-full rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-700",
        sighting.species
    ));

    // Show Recent for sightings from the last 30 days
    if (isRecent(sighting.date)) {
        top.appendChild(makeElement(
            "span",
            "ml-auto rounded bg-[#173B70] px-2 py-1 text-xs font-medium text-white",
            "Recent"
        ));
    }

    card.appendChild(top);

    // Show the date and Latin name
    const detail = [formatDate(sighting.date)];

    if (sighting.latinName) {
        detail.push(sighting.latinName);
    }

    card.appendChild(makeElement(
        "p",
        "mt-2 text-xs text-gray-600",
        detail.join(" · ")
    ));


    // Clicking a result opens that specific sighting
    card.addEventListener("click", () => {


        // Show the selected report's details
        showCityDetails(city, matchingSightings, sighting);

        // Move down to the details so the user can see them
        document.getElementById("sightingPanel").scrollIntoView({
            behavior: "smooth",
            block: "nearest"
        });

        // Move the map to the selected city
        map.flyTo({
            center: cityCoordinates[city],
            zoom: 8
        });
    });


    return card;
}


// BUILD THE RESULTS LIST

function renderResults(sightings, shownCities) {
    resultsList.replaceChildren();

    // Only show reports for cities still visible on the filtered map
    const matching = sightings
        .filter(sighting =>
            shownCities.has(cityKey(sighting.location))
        )
        .sort((a, b) => b.date.localeCompare(a.date));

    if (matching.length === 0) {
        resultsList.appendChild(makeElement(
            "p",
            "text-sm text-gray-500",
            "No sightings match your filters."
        ));

        return;
    }

    resultsList.appendChild(makeElement(
        "p",
        "mb-1 text-xs text-gray-600",
        `${matching.length} matching sightings`
    ));

    // Show a few cards at a time to keep the sidebar manageable
    let displayed = 0;

    function showMore() {

        const end = Math.min(
            displayed + RESULTS_PER_BATCH,
            matching.length
        );

        for (; displayed < end; displayed++) {

            const sighting = matching[displayed];

            resultsList.appendChild(createResultCard(
                sighting,
                shownCities.get(cityKey(sighting.location)),
                matching
            ));
        }

        // Let users load more results if needed
        if (displayed < matching.length) {

            const more = makeElement(
                "button",
                `rounded-lg border border-[#173B70]
                 bg-white px-3 py-2 text-sm text-[#173B70]
                 hover:bg-blue-50`,
                `Show more (${matching.length - displayed} remaining)`
            );

            more.type = "button";

            more.addEventListener("click", () => {
                more.remove();
                showMore();
            });

            resultsList.appendChild(more);
        }
    }

    showMore();
}


// CITY DETAILS, TIMELINE AND QUICK ACTIONS

function showCityDetails(city, sightings, selectedSighting = null) {

    // Find all sightings for the selected city
    const citySightings = sightings
        .filter(sighting =>
            cityKey(sighting.location) === city
        )
        .sort((a, b) => b.date.localeCompare(a.date));

    if (citySightings.length === 0) return;

    const latest = selectedSighting || citySightings[0];
    const name = cityLabel(city);

    // Did the user click a report or a city marker?
    const isIndividual = selectedSighting !== null;

    // Give the panel the right heading
    document.getElementById("detailsSectionHeading").textContent =
        isIndividual ? "Sighting Details" : "Area Overview";

    // City totals and timelines are only shown for map markers
    document.getElementById("cityTotal")
        .classList.toggle("hidden", isIndividual);


    // Only show the timeline when a city marker is selected
    document.getElementById("cityTimelineSection")
        .classList.toggle("hidden", isIndividual);

    // Show the instructions when viewing an individual report
    document.getElementById("timelinePrompt")
        .classList.toggle("hidden", !isIndividual);

    // Display the selected city's name
    if (!isIndividual) {
        document.getElementById("timelineCity").textContent =
            `${name} — Yearly Sightings`;
    }



    // Directions refer to the city centre, not a specific report
    document.getElementById("directionsButton")
        .classList.toggle("hidden", isIndividual);

    document.getElementById("locationDisclaimer")
        .classList.toggle("hidden", isIndividual);

    // Change the heading depending on what was clicked
    const heading = document.getElementById("sightingDetailsHeading");

    if (heading) {
        heading.textContent =
            selectedSighting ? "Selected sighting" : "Latest sighting";
    }

    // Show the details panel
    document.getElementById("sightingPrompt")
        .classList.add("hidden");

    document.getElementById("sightingPanel")
        .classList.remove("hidden");

    // Display the city's total and latest sighting
    document.getElementById("selectedCity").textContent = name;

    document.getElementById("cityTotal").textContent =
        `${citySightings.length} reported sightings`;

    document.getElementById("latestDate").textContent =
        formatDate(latest.date);

    document.getElementById("latestSpecies").textContent =
        latest.species;

    // Use the API's Latin name, or look it up for a community report
    const latinName = latest.latinName ||
        speciesLatinNames[latest.species.trim().toLowerCase()] ||
        "Not available";

    document.getElementById("latestLatin").textContent = latinName;


    // SHOW THE SIGHTING TIME

    // Some reports store time inside date; older ones store it separately
    const reportTime = latest.time ||
        (latest.date.includes("T") ? latest.date.slice(11, 16) : "");

    document.getElementById("latestTime").textContent = reportTime;

    document.getElementById("sightingTimeRow")
        .classList.toggle("hidden", !reportTime);




    // SHOW THE SUBMITTED PHOTO

    const photoSection = document.getElementById("sightingPhotoSection");
    const photo = document.getElementById("latestImage");

    // Clear the previous report's picture
    photoSection.classList.add("hidden");
    photo.removeAttribute("src");

    // Only show pictures that were actually uploaded
    if (
        typeof latest.imagePath === "string" &&
        latest.imagePath.startsWith("/uploads/")
    ) {

        photo.alt = `Submitted tick photo from ${name}`;

        // Hide the picture if it cannot be loaded
        photo.onerror = () => {
            photoSection.classList.add("hidden");
        };

        // Show the container so the browser can load the picture
        photoSection.classList.remove("hidden");

        photo.src = latest.imagePath;
    }

    document.getElementById("latestId").textContent =
        latest.id;

    // Count the reports in each year for this city
    const yearlyCounts = new Map();

    for (const sighting of citySightings) {

        const year = sighting.date.slice(0, 4);

        yearlyCounts.set(
            year,
            (yearlyCounts.get(year) || 0) + 1
        );
    }



    // Find the timeline and clear the previous city
    const timeline = document.getElementById("cityTimeline");
    timeline.replaceChildren();

    // Find the highest yearly count to size the bars
    const highestCount = Math.max(1, ...yearlyCounts.values());

    // Show the years in order
    const years = [...yearlyCounts.keys()].sort();

    for (const year of years) {

        const count = yearlyCounts.get(year);

        // Create a row for each year
        const item = document.createElement("li");
        item.className =
            "flex items-center gap-3 border-l-2 border-[#173B70] py-1 pl-3";

        // Keep the year and number of sightings visible
        const label = document.createElement("span");
        label.className =
            "w-40 shrink-0 whitespace-nowrap text-xs text-gray-800 sm:text-sm";
        label.textContent =
            `${year}: ${count} sighting${count === 1 ? "" : "s"}`;

        // Add a horizontal bar next to the count
        const bar = document.createElement("progress");
        bar.value = count;
        bar.max = highestCount;


        bar.setAttribute(
            "aria-label",
            `${year}: ${count} reported sightings`
        );

        // Put the text and bar in the same row
        item.appendChild(label);
        item.appendChild(bar);

        timeline.appendChild(item);

    }


    // DIRECTIONS

    // Directions go to the city centre, not an exact sighting
    const [longitude, latitude] = cityCoordinates[city];

    document.getElementById("directionsButton").onclick = () => {

        window.open(
            `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`,
            "_blank",
            "noopener,noreferrer"
        );
    };


    // SHARE

    // SHARE

    const shareStatus = document.getElementById("shareStatus");
    const shareOptions = document.getElementById("shareOptions");

    shareStatus.textContent = "";
    shareOptions.classList.add("hidden");

    // Get the yearly counts ready to share
    const timelineText = [...yearlyCounts.entries()]
        .sort((a, b) => Number(a[0]) - Number(b[0]))
        .map(([year, count]) =>
            `${year}: ${count} sighting${count === 1 ? "" : "s"}`
        )
        .join("\n");

    // Share the city details without a localhost link


    // Share individual report details or the city summary
    const shareText = (isIndividual ? [

        `Tick Sighting — ${name}`,
        `Date: ${formatDate(latest.date)}`,
        ...(reportTime ? [`Time: ${reportTime}`] : []),
        `Species: ${latest.species}`,
        `Latin name: ${latinName}`,
        `ID: ${latest.id}`

    ] : [

        `Tick Sightings — ${name}`,
        `Total reported sightings: ${citySightings.length}`,
        "Latest sighting",
        `Date: ${formatDate(latest.date)}`,
        `Species: ${latest.species}`,
        `Latin name: ${latinName}`,
        `ID: ${latest.id}`,
        "Activity timeline",
        timelineText,
        "Locations are approximate city centres, not exact tick sighting locations."

    ]).join("\n");

    // Open or close the sharing options
    document.getElementById("shareButton").onclick = () => {

        shareOptions.classList.toggle("hidden");
        shareStatus.textContent = "";
    };

    // WHATSAPP

    document.getElementById("shareWhatsApp").onclick = () => {

        // WhatsApp will open with our sighting details
        const url = `https://wa.me/?text=${encodeURIComponent(shareText)}`;

        window.open(url, "_blank", "noopener,noreferrer");

        shareOptions.classList.add("hidden");
    };

    // MORE OPTIONS

    document.getElementById("shareMore").onclick = async () => {

        // Check if the browser supports sharing
        if (!navigator.share) {

            shareStatus.textContent =
                "Device sharing isn't available. Try WhatsApp instead.";

            return;
        }

        try {

            // Open the phone or computer's sharing menu
            await navigator.share({
                title: `Tick Sightings — ${name}`,
                text: shareText
            });

            shareOptions.classList.add("hidden");

        } catch (error) {

            // Closing the share menu isn't an error
            if (error.name !== "AbortError") {

                shareStatus.textContent =
                    "Unable to share sighting details.";

                console.error("Sharing failed:", error);
            }
        }
    };
    // EMAIL

    document.getElementById("shareEmail").onclick = () => {

        // Open the email app with the details filled in
        const subject = encodeURIComponent(`Tick Sightings — ${name}`);
        const body = encodeURIComponent(shareText);

        window.location.href = `mailto:?subject=${subject}&body=${body}`;

        shareOptions.classList.add("hidden");
    };


    // COPY TEXT

    document.getElementById("shareCopy").onclick = async () => {

        try {

            // Copy the selected city's details
            await navigator.clipboard.writeText(shareText);

            shareStatus.textContent =
                "Sighting details copied to clipboard!";

            shareOptions.classList.add("hidden");

        } catch (error) {

            shareStatus.textContent =
                "Unable to copy sighting details.";

            console.error("Copy failed:", error);
        }
    };

} // End of showCityDetails()



// FILTERS

function setupFilters(sightings) {

    // Add the available years and species from our data
    const years = [...new Set(
        sightings.map(s => s.date.slice(0, 4))
    )].sort().reverse();

    const species = [...new Set(
        sightings.map(s => s.species)
    )].sort();

    for (const year of years) {
        dateDropdown.add(new Option(year, year));
    }

    for (const name of species) {
        speciesDropdown.add(new Option(name, name));
    }
}


// APPLY FILTERS

function applyFilters(allSightings) {

    const selectedYear = dateDropdown.value;
    const selectedSpecies = speciesDropdown.value;
    const selectedActivity = activityDropdown.value;

    // Date and species filters change which reports we're counting
    const matching = allSightings.filter(sighting =>

        (selectedYear === "all" ||
            sighting.date.slice(0, 4) === selectedYear) &&

        (selectedSpecies === "all" ||
            sighting.species === selectedSpecies)
    );

    // Update the map using the filtered sightings
    const shownCities = displaySightings(
        matching,
        selectedActivity
    );

    // Update the results sidebar
    renderResults(matching, shownCities);

    // Keep the chart in step with the selected date and species
    refreshSeasonalChart();

    // Show how many cities and sightings match
    filterStatus.textContent = shownCities.size === 0
        ? "No sightings match the selected filters."
        : `${shownCities.size} cities shown · ${matching.filter(s =>
            shownCities.has(cityKey(s.location))
        ).length
        } sightings`;
}


// SEASONAL CHART

function setupChart(sightings) {

    // Only use cities we can show on the map
    const supported = sightings.filter(s =>
        cityCoordinates[cityKey(s.location)]
    );

    const cities = [...new Set(
        supported.map(s => cityKey(s.location))
    )].sort();

    const years = [...new Set(
        sightings.map(s => s.date.slice(0, 4))
    )].sort().reverse();

    // Fill the chart's city and year dropdowns
    for (const city of cities) {
        chartCity.add(new Option(cityLabel(city), city));
    }

    for (const year of years) {
        chartYear.add(new Option(year, year));
    }

    if (!window.Chart ||
        cities.length === 0 ||
        years.length === 0) {

        chartStatus.textContent =
            "Seasonal chart could not be loaded.";

        return;
    }

    // Start with the latest report that belongs to a city on our map
    const latest = [...supported].sort(
        (a, b) => b.date.localeCompare(a.date)
    )[0];

    chartCity.value = cityKey(latest.location);
    chartYear.value = latest.date.slice(0, 4);

    const months = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
    ];

    // Get the chart and its styling from the HTML
    const chartCanvas = document.getElementById("seasonalChart");
    const chartStyle = chartCanvas.dataset;

    // Create the bar chart
    const chart = new window.Chart(

        chartCanvas,
        {
            type: "bar",

            data: {
                labels: months,

                datasets: [{
                    label: "Reported sightings",
                    data: Array(12).fill(0),

                    // Read the styling choices from index.html
                    backgroundColor: chartStyle.barColor,
                    hoverBackgroundColor: chartStyle.hoverColor,
                    borderRadius: Number(chartStyle.barRadius),
                    maxBarThickness: Number(chartStyle.barThickness),
                    borderSkipped: chartStyle.borderSkipped === "true"
                }]
            },

            options: {
                responsive: true,
                maintainAspectRatio: false,

                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { precision: 0 }
                    }
                }
            }
        }
    );

    // UPDATE CHART

    function updateChart(syncFilters = false) {

        const species = speciesDropdown.value;
        const selectedYear = dateDropdown.value;

        if (syncFilters) {

            // Use the year selected in the main filters
            if (selectedYear !== "all") {
                chartYear.value = selectedYear;
            }

            // Check whether the selected chart city has matching reports
            const matchesChartSelection = supported.some(s =>

                cityKey(s.location) === chartCity.value &&

                s.date.slice(0, 4) === chartYear.value &&

                (species === "all" || s.species === species)
            );

            // Find another city with matching reports if needed
            if (!matchesChartSelection) {

                const replacement = supported.find(s =>

                    (selectedYear === "all" ||
                        s.date.slice(0, 4) === selectedYear) &&

                    (species === "all" ||
                        s.species === species)
                );

                if (replacement) {
                    chartCity.value = cityKey(replacement.location);
                    chartYear.value = replacement.date.slice(0, 4);
                }
            }
        }

        // Start with zero for every month
        const counts = Array(12).fill(0);

        // Count matching sightings for the selected city and year
        for (const sighting of supported) {

            if (
                cityKey(sighting.location) !== chartCity.value ||
                sighting.date.slice(0, 4) !== chartYear.value ||
                (species !== "all" && sighting.species !== species)
            ) {
                continue;
            }

            const month = Number(
                sighting.date.slice(5, 7)
            ) - 1;

            if (month >= 0 && month < 12) {
                counts[month]++;
            }
        }

        // Update the chart with the monthly counts
        chart.data.datasets[0].data = counts;
        chart.update();

        // Calculate the total number of sightings
        const total = counts.reduce(
            (sum, count) => sum + count,
            0
        );

        // Get the selected city and species
        const label =
            chartCity.selectedOptions[0]?.text || "this city";

        const speciesLabel =
            species === "all" ? "all species" : species;

        // Show the total in the first summary card
        document.getElementById("chartTotal").textContent =
            total.toLocaleString();

        // Find the month with the highest number of reports
        const highestCount = Math.max(...counts);

        const peakMonth = highestCount > 0
            ? `${months[counts.indexOf(highestCount)]} (${sightingCount(highestCount)})`
            : "No reports";

        // Update the second summary card
        document.getElementById("chartPeak").textContent =
            peakMonth;

        // Update the third summary card
        document.getElementById("chartSelection").textContent =
            `${label} · ${chartYear.value}`;

        chartStatus.textContent =
            `${sightingCount(total)} in ${label} during ` +
            `${chartYear.value} (${speciesLabel}).`;
    }
    // Refresh the chart when its dropdowns change
    chartCity.addEventListener(
        "change",
        () => updateChart()
    );

    chartYear.addEventListener(
        "change",
        () => updateChart()
    );

    // Let the main filters update the chart too
    refreshSeasonalChart = () => updateChart(true);

    updateChart(true);
}


// START THE PAGE

// The backend already validates and removes duplicate sightings
const sightings = await loadSightings();

if (sightings === null) {

    filterStatus.textContent =
        "Tick sightings could not be loaded. Check the backend connection.";

    resultsList.textContent =
        "Unable to load results.";

    chartStatus.textContent =
        "Seasonal chart could not be loaded.";

} else {

    // Fill the filter dropdowns and create the chart
    setupFilters(sightings);
    setupChart(sightings);

    // Update the map, results and chart when filters change
    dateDropdown.addEventListener(
        "change",
        () => applyFilters(sightings)
    );

    speciesDropdown.addEventListener(
        "change",
        () => applyFilters(sightings)
    );

    activityDropdown.addEventListener(
        "change",
        () => applyFilters(sightings)
    );

    // Show all available results when the page first loads
    applyFilters(sightings);
}
