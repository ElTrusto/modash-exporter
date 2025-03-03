document.addEventListener("DOMContentLoaded", () => {
  console.log("DevTools panel loaded");

  const extractBtn = document.getElementById("extractBtn");
  const resetBtn = document.getElementById("resetBtn");
  const saveBtn = document.getElementById("saveBtn");
  const resultsDiv = document.getElementById("results");
  const resultCount = document.getElementById("resultCount");
  const filterInput = document.getElementById("filterInput");

  let extractedTexts = new Set();

  extractBtn.addEventListener("click", () => {
    console.log("Extract button clicked");

    const filterClass = filterInput.value.trim();
    console.log("Filter class:", filterClass);

    resultsDiv.innerHTML = "<p>Extracting...</p>";
    saveBtn.disabled = true;

    const extractSpanText = function(filterClass) {
      console.log("Extracting spans with class:", filterClass);
      let spans;

      if (filterClass) {
        const lowerCaseFilterClass = filterClass.toLowerCase();
        spans = Array.from(document.querySelectorAll("span")).filter((span) =>
          Array.from(span.classList).some((className) =>
            className.toLowerCase().includes(lowerCaseFilterClass)
          )
        );
      } else {
        spans = document.querySelectorAll("span");
      }

      console.log("Found spans:", spans.length);
      const texts = [];
      spans.forEach((span) => {
        const text = span.textContent.trim().replace(/@/g, "");
        if (text) {
          texts.push(text);
        }
      });

      return texts;
    };

    chrome.devtools.inspectedWindow.eval(
      `(${extractSpanText.toString()})(${JSON.stringify(filterClass)})`,
      (result, isException) => {
        if (isException) {
          console.error("Error executing script:", isException);
        } else {
          console.log("Extraction result:", result);
          handleResults(result);
        }
      }
    );
  });

  resetBtn.addEventListener("click", () => {
    console.log("Reset button clicked");
    extractedTexts.clear();
    updateResultsDisplay();
  });

  saveBtn.addEventListener("click", () => {
    console.log("Save button clicked");

    if (extractedTexts.size === 0) {
      console.log("No texts to save");
      return;
    }

    const textToSave = Array.from(extractedTexts).join("\n");
    const blob = new Blob([textToSave], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

    chrome.downloads.download({
      url: url,
      filename: `span-text-${timestamp}.txt`,
      saveAs: true,
    });
  });

  function handleResults(results) {
    console.log("Handling results:", results);

    results.forEach((text) => extractedTexts.add(text));
    updateResultsDisplay();
  }

  function updateResultsDisplay() {
    resultsDiv.innerHTML = Array.from(extractedTexts)
      .map((text) => `<p class="result-item">${text}</p>`)
      .join("");
    resultCount.textContent = extractedTexts.size;
    saveBtn.disabled = extractedTexts.size === 0;
  }

  chrome.devtools.panels.create(
    "Span Text Extractor", // Title of the panel
    "icons/icon48.png",    // Icon for the panel
    "devtools.html",       // HTML page to load into the panel
    function (panel) {
      // Code to execute on panel creation, if needed
    }
  );
}); 