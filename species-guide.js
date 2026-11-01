
// 1. TICK SPECIES INFORMATION

// Keep the information for all six species together
const speciesInformation = [
    {
        name: "Fox/badger tick",
        latin: "Ixodes canisuga",
        description:
            "Often found on foxes, badgers and dogs. It can be found around places where these animals rest, such as dens and shelters.",
        image: "./images/ticks/fox-badger-tick.svg"
    },
    {
        name: "Marsh tick",
        latin: "Ixodes apronophorus",
        description:
            "Usually associated with wetlands and damp habitats. It mainly feeds on small mammals, including water voles.",
        image: "./images/ticks/marsh-tick.svg"
    },
    {
        name: "Passerine tick",
        latin: "Ixodes frontalis",
        description:
            "Mainly found on birds, especially small perching birds. It is associated with places where birds nest and rest.",
        image: "./images/ticks/passerine-tick.svg"
    },
    {
        name: "Southern rodent tick",
        latin: "Ixodes acuminatus",
        description:
            "Usually associated with small rodents and their burrows. It is less commonly encountered than some other UK tick species.",
        image: "./images/ticks/southern-rodent-tick.svg"
    },
    {
        name: "Tree-hole tick",
        latin: "Ixodes arboricola",
        description:
            "Often found around tree holes where birds nest. It is particularly associated with cavity-nesting birds.",
        image: "./images/ticks/tree-hole-tick.svg"
    },
    {
        name: "Sheep/deer tick",
        latin: "Ixodes ricinus",
        description:
            "One of the most common UK ticks. It can be found in grassy and wooded habitats and may feed on wildlife, pets and people.",
        image: "./images/ticks/ixodes-ricinus.svg"
    }
];


// 2. GET THE HTML ELEMENTS

const speciesCardGrid = document.getElementById("speciesCardGrid");
const speciesCardTemplate = document.getElementById("speciesCardTemplate");


// 3. FLIP A CARD

function setCardState(card, flipped) {

    // The HTML uses this to control the flip animation
    card.dataset.flipped = String(flipped);

    // Let screen readers know whether it is selected
    card.setAttribute("aria-pressed", String(flipped));

    const speciesName = card.querySelector("[data-name]").textContent;

    card.setAttribute(
        "aria-label",
        `${flipped ? "Hide" : "Show"} details for ${speciesName}`
    );

    // Only expose the visible face to screen readers
    card.querySelector("[data-front]")
        .setAttribute("aria-hidden", String(flipped));

    card.querySelector("[data-back]")
        .setAttribute("aria-hidden", String(!flipped));
}


// 4. BUILD THE SPECIES CARDS

if (speciesCardGrid && speciesCardTemplate) {

    // Start with an empty gallery
    speciesCardGrid.replaceChildren();

    for (const species of speciesInformation) {

        // Copy the card layout from index.html
        const card = speciesCardTemplate.content
            .firstElementChild.cloneNode(true);

        // Add the picture
        const image = card.querySelector("[data-image]");

        image.src = species.image;
        image.alt = `Illustration of ${species.name}`;

        // Add the species name to both sides
        card.querySelectorAll("[data-name]").forEach(element => {
            element.textContent = species.name;
        });

        // Add the Latin name to both sides
        card.querySelectorAll("[data-latin]").forEach(element => {
            element.textContent = species.latin;
        });

        // Add the description to the back
        card.querySelector("[data-description]").textContent =
            species.description;

        // Start with the front showing
        setCardState(card, false);

        // Flip when clicked
        card.addEventListener("click", () => {

            const wasFlipped = card.dataset.flipped === "true";

            // Close any other open cards
            for (const otherCard of speciesCardGrid.children) {
                setCardState(otherCard, false);
            }

            // Flip the selected card
            setCardState(card, !wasFlipped);
        });

        // Put the finished card into the gallery
        speciesCardGrid.appendChild(card);
    }
}
