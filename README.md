# Elanco Tick Tracker

**Full-Stack Software Engineering Placement Task | Elanco**  
**Created by Hanin Abdallah**

Elanco Tick Tracker is a full-stack web application for exploring reported tick sightings across the UK and submitting new reports. It brings together the tick-sighting data provided for the Elanco assessment, an interactive map, useful information about tick species, and a reporting form connected to my own backend.

I wanted the website to be straightforward to use, while also showing how the frontend, API, data validation and storage work together.



## Features

### Interactive sighting map

- Explore UK tick reports on an interactive map built with **MapLibre GL JS**.
- Filter sightings by **year, species and reported activity level**.
- View the number of sightings associated with each city.
- Select a city to see its report total, latest sighting and yearly activity timeline.
- Select an individual result to see its date, time (where available), species, scientific name, report ID and uploaded image (where available).
- Share sighting details or open directions to an approximate city centre.

Marker colours show **relative reporting activity**. I sort city report totals and use one-third and two-thirds cut-off positions to group cities into low (green), medium (yellow) and high (red). This is a comparison of the available reports, **not a measure of infection or medical risk**.

### Species information and seasonal trends

- Six illustrated tick-species cards that flip to show more information.
- Practical prevention advice with links to **NHS** and **RSPCA** guidance.
- A **Chart.js** bar chart showing reports by month for a selected city and year.
- Summary information including total reports and peak reporting month.

### Report a sighting

Users can submit a report containing:

- A date and time.
- A UK city/location and tick species.
- An **optional** image (JPEG, PNG or WebP, maximum **5 MB**).

The form gives feedback for missing or invalid information, warns when no photo is included, and displays a unique report ID after a successful submission. Submitted reports are checked by the backend and saved locally.

### Accessibility

I've included a few accessibility features, including a **Skip to main content** link, visible keyboard focus, keyboard-operable species cards, labelled form controls and screen-reader-friendly form status messages. These are useful improvements, although the application has not undergone a full accessibility audit.

## How to run the project

### What you'll need

- **Node.js 20 or newer** (includes npm).
- An internet connection to load Elanco's external data, map resources and CDN-based frontend libraries.
- A terminal, such as the terminal in **Visual Studio Code**.

**You do not need to install or configure a separate database.** New community reports are stored in a local JSON file, which the backend creates automatically when needed.

### Step 1 — Get the project

Clone the GitHub repository or download it as a ZIP file. Open the project folder in VS Code.

Make sure you're in the main project folder, where `package.json` is located.

### Step 2 — Install dependencies

Open a terminal in that folder and run:

```bash
npm install
```

This installs the packages required by the backend and the Tailwind CSS build process.

### Step 3 — Build the CSS

```bash
npm run build:css
```

This compiles `css/input.css` into `css/output.css`, which is used by both website pages.

### Step 4 — Start the application

```bash
npm start
```

Open the following addresses in your browser:

- **Main website:** http://localhost:3000
- **Report a sighting:** http://localhost:3000/report.html
- **Backend health check:** http://localhost:3000/api/health

Keep the terminal open while using the website. Press **Ctrl + C** in the terminal to stop the server.

**Windows PowerShell note:** If PowerShell blocks `npm.ps1`, use `npm.cmd` instead of `npm`. For example:

```powershell
npm.cmd install
npm.cmd run build:css
npm.cmd start
```

### Development commands

To restart the backend automatically when server files change:

```bash
npm run dev
```

To rebuild Tailwind CSS while editing the HTML or styles, run the following in **another terminal**:

```bash
npm run watch:css
```

The server uses **port 3000** by default. You can change it by setting the `PORT` environment variable. No `.env` file or API key is required for the normal setup.

## Technologies used

- **HTML, CSS and vanilla JavaScript:** The frontend, including the map controls, results, reporting form and species guide.
- **Tailwind CSS v4:** Responsive layouts and consistent styling.
- **MapLibre GL JS:** Interactive map and city markers.
- **Chart.js:** Monthly sighting visualisation.
- **Node.js and Express:** HTTP API, request handling and serving the frontend.
- **Multer:** Optional photograph uploads with file-type and size restrictions.
- **JSON file storage:** Local persistence for community-submitted sightings.

I chose vanilla JavaScript because it suits the scope of the task and keeps the code easy to follow without adding a frontend framework. Using Node.js and Express also meant I could work in JavaScript across both sides of the application.

## How the application works

1. **The frontend** requests sighting data from the application's Express API, rather than calling the Elanco service directly.
2. **`backend/src/elanco.js`** retrieves the assessment dataset, applies a five-minute in-memory cache and handles external API errors.
3. **`backend/src/sightings.js`** cleans the data, removes repeated IDs, handles filtering and calculates regional/time-based totals.
4. **`backend/server.js`** combines Elanco sightings with locally submitted community reports and returns the requested results.
5. **`main.js`** uses those results to update the map, result cards, activity timeline and seasonal chart.
6. When someone submits a report, **`report.js`** sends it to `POST /api/sightings`. The backend validates it again, creates a unique ID and saves it through **`backend/src/storage.js`**.

**Elanco assessment dataset:** https://dev-task.elancoapps.com/data/tick-sightings

### Why I used JSON storage

I considered using a database, but for this assessment I chose local JSON storage to keep the setup simple and make it easier for someone to download and run the project without extra services.

To make saving more reliable, `storage.js`:

- Creates the data file if it doesn't already exist.
- Processes writes one at a time using a promise queue.
- Writes the updated data to a temporary file before replacing the existing file.

This is a reasonable approach for a small, single-server project. For a production application with more users or multiple server instances, I would switch to a proper database and dedicated image storage.

## API endpoints

The backend exposes the following routes:

- **`GET /api/health`** — Check that the backend is running.
- **`GET /api/species`** — Get the available species for the reporting form.
- **`GET /api/sightings`** — Retrieve cleaned, combined and paginated sighting data.
- **`POST /api/sightings`** — Validate and save a new community sighting, with an optional image.
- **`GET /api/insights/regions`** — Get sighting totals grouped by location.
- **`GET /api/insights/trends?period=monthly`** — Get monthly reporting totals.
- **`GET /api/insights/trends?period=weekly`** — Get weekly reporting totals.

For example, you can open this URL in your browser to request five sightings:

```text
http://localhost:3000/api/sightings?page=1&limit=5
```

The sightings endpoint also supports `location`, `startDate` and `endDate` filters. Dates use the `YYYY-MM-DD` format, and the maximum page size is **100**.

To submit a report, send **`multipart/form-data`** to `POST /api/sightings` with `date`, `time`, `location` and `species`, plus an optional `image`. A successful submission returns HTTP **201**, a confirmation message and the newly created sighting (including its ID).

## Handling data and errors

The assessment asked us to think about larger datasets, duplicates and incomplete records. I've handled those in a few ways:

- **Duplicates:** Repeated sighting IDs are removed when records are cleaned.
- **Incomplete data:** Records missing essential values or containing invalid information are skipped rather than included in map and chart totals.
- **Larger datasets:** The backend supports pagination of up to 100 records per request. The frontend also renders the results list in batches, rather than adding every result card at once.
- **External API requests:** Elanco data is cached for five minutes, with a request timeout and controlled retry behaviour.
- **External API failures:** Previously cached data can be used temporarily, with a warning shown to the user when the data may be outdated. If no usable cache exists, the API returns an error instead of pretending the request succeeded.
- **New reports:** The backend checks submitted fields even if the frontend has already validated them.
- **Image uploads:** Multer applies a 5 MB limit and accepts declared JPEG, PNG and WebP types. Images are removed if a report cannot be saved.

## Project structure

```text
elanco-tick-tracker/
├── backend/
│   ├── server.js              # Express server and API routes
│   ├── src/
│   │   ├── elanco.js          # Elanco API requests and caching
│   │   ├── sightings.js       # Validation, cleaning and statistics
│   │   └── storage.js         # JSON storage and safer writes
│   ├── data/                  # Local reports (created as needed)
│   └── uploads/               # Uploaded photographs
├── css/
│   ├── input.css              # Tailwind source styles
│   └── output.css             # Compiled website styles
├── images/                    # Website images and tick illustrations
├── index.html                 # Map, guides and seasonal chart
├── main.js                    # Map, filters and results logic
├── report.html                # Report a sighting page
├── report.js                  # Form behaviour and submission
├── species-guide.js           # Interactive tick species cards
├── package.json               # Dependencies and run commands
├── package-lock.json          # Locked dependency versions
├── .gitignore                 # Excluded local/private files
└── README.md                  # Project documentation
```

## Try it out: quick testing checklist

1. **Map and filters:** Open the homepage, change the year/species/activity filters and check that the map and results update.
2. **Sighting details:** Click a city marker and an individual result to view their information and the city's activity timeline.
3. **Species and chart:** Flip a species card; change the city and year in the seasonal chart.
4. **Form validation:** Open the reporting page and try submitting without the required information.
5. **Photo warning:** Fill in a valid report without a photo and check the warning.
6. **Save a report:** Submit a valid test report. Check that a success message and unique ID appear, then return to the map and look for the new report.
7. **API check:** Open `/api/health` and `/api/sightings?page=1&limit=5` directly in your browser.
8. **Keyboard navigation:** Press Tab to reveal the Skip to main content link, and use Enter/Space to operate a species card.

The local `backend/data/sightings.json` file and ordinary uploaded images are excluded from Git so that personal/test submissions are not accidentally published. The data file is created automatically on first use. If you clone the repository, previously submitted local reports will therefore not appear until you add your own.

## Current limitations and possible improvements

This project is a working assessment prototype, not a production reporting service. There are a few areas I'd improve if I developed it further:

- Use a database and persistent image storage for larger-scale deployments.
- Add automated backend and browser tests, alongside more accessibility testing.
- Add stricter upload verification, rate limiting and moderation for publicly submitted reports.
- Use server-side aggregation more widely if the dataset grows significantly; the current map/chart loads the paginated dataset into the browser.
- Improve resilience when the Elanco API is unavailable during a fresh server start with no existing cache.
- Replace approximate city-level locations with a more precise location system if appropriate data becomes available and privacy requirements allow it.

## Walkthrough video

A separate walkthrough video demonstrates the map and filters, reporting form, accessibility improvements and main backend decisions.

**Video link:** : https://youtu.be/8jwPjTUkOI0?si=oLMBh9J5xz_aZNSC 

## Credits

Created by **Hanin Abdallah** for the **Elanco Software Engineering Placement** assessment.

- **Elanco:** Assessment dataset and branding.
- **MapLibre GL JS:** Interactive map.
- **Chart.js:** Seasonal reporting chart.
- **NHS and RSPCA:** Linked health and pet-care guidance.

This project is an independent technical assessment and is not an official Elanco product.
