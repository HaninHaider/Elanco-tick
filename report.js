
// 1. FORM ELEMENTS

const reportForm = document.getElementById("reportForm");
const dateInput = document.getElementById("reportDate");
const locationDropdown = document.getElementById("reportLocation");
const speciesDropdown = document.getElementById("reportSpecies");
const reportMessage = document.getElementById("reportMessage");
const submitButton = document.getElementById("submitSighting");
const imageInput = document.getElementById("reportImage");


const photoWarning = document.getElementById("photoWarning");

// Keep track of whether the user has seen the photo warning
let confirmedNoPhoto = false;

// Reset the warning if the user changes the form
reportForm.addEventListener("change", () => {
    confirmedNoPhoto = false;
    photoWarning.classList.add("hidden");

    // Clear old messages when the user changes the form
    if (
        reportMessage.dataset.type === "error" ||
        reportMessage.dataset.type === "success"
    ) {
        showMessage("", "loading");
    }
});


// 2. DATE AND TIME OPTIONS

// Don't allow dates after today
const today = new Date();

const todayDate = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0")
].join("-");

dateInput.max = todayDate;


// Find the hour and minute dropdowns
const hourDropdown = document.getElementById("reportHour");
const minuteDropdown = document.getElementById("reportMinute");

// Add hours from 00 to 23
for (let hour = 0; hour < 24; hour++) {
    const value = String(hour).padStart(2, "0");
    hourDropdown.add(new Option(value, value));
}

// Add minutes from 00 to 59
for (let minute = 0; minute < 60; minute++) {
    const value = String(minute).padStart(2, "0");
    minuteDropdown.add(new Option(value, value));
}


// 3. LOCATION DROPDOWN OPTIONS

// Use the same 14 cities as our interactive map
const cities = [
    "Birmingham", "Bristol", "Cardiff",
    "Edinburgh", "Glasgow", "Leeds",
    "Leicester", "Liverpool", "London",
    "Manchester", "Newcastle", "Nottingham",
    "Sheffield", "Southampton"
];

// Add the cities to the dropdown
for (const city of cities) {
    locationDropdown.add(new Option(city, city));
}


// 4. FORM FEEDBACK MESSAGES

// Show the message using the styling from report.html
function showMessage(message, type) {
    reportMessage.textContent = message;
    reportMessage.dataset.type = type;
}

// 5. SPECIES DROPDOWN OPTIONS

// Get the available tick species from our backend
async function loadSpecies() {

    // Don't allow submissions before the species have loaded
    submitButton.disabled = true;
    showMessage("Loading tick species...", "loading");

    try {

        const response = await fetch("/api/species");

        if (!response.ok) {
            throw new Error("Unable to load species");
        }

        const species = await response.json();

        if (!Array.isArray(species)) {
            throw new Error("Invalid species response");
        }

        // Remove empty names, Unknown and duplicate species
        const validSpecies = [...new Set(
            species.filter(name =>
                typeof name === "string" &&
                name.trim() !== "" &&
                name.trim().toLowerCase() !== "unknown"
            ).map(name => name.trim())
        )];

        // Make sure we actually have species to display
        if (validSpecies.length === 0) {
            throw new Error("No tick species available");
        }

        // Add the species to the dropdown
        for (const name of validSpecies.sort()) {
            speciesDropdown.add(new Option(name, name));
        }

        // The form can now be submitted
        submitButton.disabled = false;
        showMessage("", "success");

    } catch (error) {

        console.error("Species loading failed:", error);

        // Keep the submit button disabled if loading fails
        showMessage(
            "Unable to load tick species. Please refresh the page and try again.",
            "error"
        );
    }
}


// Show a clear message when a required field is missing
const fieldErrors = {
    reportDate: "Please enter a valid sighting date.",
    reportHour: "Please select an hour.",
    reportMinute: "Please select a minute.",
    reportLocation: "Please select a city.",
    reportSpecies: "Please select a tick species."
};

reportForm.addEventListener("invalid", (event) => {

    // Only show the first invalid field
    const firstInvalid = reportForm.querySelector(":invalid");

    if (event.target === firstInvalid) {
        showMessage(
            fieldErrors[event.target.id] || "Please check your information.",
            "error"
        );
    }

}, true);

// 6. SUBMIT THE SIGHTING

reportForm.addEventListener("submit", async (event) => {

    // Stop the page from refreshing
    event.preventDefault();

    // Check the date again before submitting
    const now = new Date();

    const currentDate = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, "0"),
        String(now.getDate()).padStart(2, "0")
    ].join("-");

    dateInput.max = currentDate;

    if (dateInput.value > currentDate) {
        showMessage(
            "Sighting date cannot be in the future.",
            "error"
        );
        return;
    }

    // Check the uploaded image before sending it
    const image = imageInput.files[0];


    // Only accept the image formats supported by our backend
    const allowedImageTypes = [
        "image/jpeg",
        "image/png",
        "image/webp"
    ];

    if (image && !allowedImageTypes.includes(image.type)) {
        showMessage(
            "Please upload a JPG, PNG or WebP image.",
            "error"
        );
        return;
    }


    if (image && image.size > 5 * 1024 * 1024) {
        showMessage(
            "The image must be 5 MB or smaller.",
            "error"
        );
        return;
    }

    // Warn once if the user hasn't included a photo
    if (!image && !confirmedNoPhoto) {
        confirmedNoPhoto = true;


        // Clear any old error before showing the warning
        showMessage("", "loading");
        photoWarning.classList.remove("hidden");
        return;
    }

    // Hide the warning when the submission starts
    photoWarning.classList.add("hidden");


    // Put the form information together
    const formData = new FormData();

    formData.append("date", dateInput.value);

    formData.append(
        "time",
        `${hourDropdown.value}:${minuteDropdown.value}`
    );

    formData.append("location", locationDropdown.value);
    formData.append("species", speciesDropdown.value);

    // Add the picture if one was uploaded
    if (image) {
        formData.append("image", image);
    }

    // Stop the user submitting twice
    submitButton.disabled = true;
    showMessage("Submitting your sighting...", "loading");

    try {

        // Send the report to our backend
        const response = await fetch("/api/sightings", {
            method: "POST",
            body: formData
        });

        // Handle the response without crashing on invalid JSON
        const result = await response.json().catch(() => null);

        if (!response.ok) {
            throw new Error(
                result?.error || "Unable to submit sighting."
            );
        }


        // Make sure the server returned the message and report ID
        if (
            !result ||
            typeof result.message !== "string" ||
            typeof result.sighting?.id !== "string"
        ) {
            throw new Error("Unexpected response from the server.");
        }

        // Show the success message and the generated report ID
        showMessage(
            `${result.message} Your report ID: ${result.sighting.id}`,
            "success"
        );

        // Clear the form after a successful submission
        reportForm.reset();

        // Reset the photo warning for the next report
        confirmedNoPhoto = false;
        photoWarning.classList.add("hidden");


    } catch (error) {

        console.error("Sighting submission failed:", error);

        showMessage(
            error.message || "Unable to submit sighting.",
            "error"
        );

    } finally {

        // Let the user submit again
        submitButton.disabled = false;
    }
});


// 7. INITIALISE FORM

// Load the species when the page opens
loadSpecies();
