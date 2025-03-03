document.addEventListener("DOMContentLoaded", () => {
  console.log("DevTools panel loaded");

  const extractBtn = document.getElementById("extractBtn");
  const resetBtn = document.getElementById("resetBtn");
  const saveBtn = document.getElementById("saveBtn");
  const resultsDiv = document.getElementById("results");
  const resultCount = document.getElementById("resultCount");
  const filterInput = document.getElementById("filterInput");
  
  // Add a stop button to the controls
  const stopBtn = document.createElement("button");
  stopBtn.id = "stopBtn";
  stopBtn.textContent = "Stop Extraction";
  stopBtn.style.backgroundColor = "#f44336";
  stopBtn.style.display = "none";
  document.querySelector(".controls").insertBefore(stopBtn, resetBtn);

  let extractedTexts = new Set();
  let isExtractionRunning = false;
  let extractionTimeout = null;

  function updateResultsDisplay() {
    console.log("Updating results display with", extractedTexts.size, "texts");
    
    resultCount.textContent = extractedTexts.size;
    
    if (extractedTexts.size === 0) {
      resultsDiv.innerHTML = "<p class='no-results'>No results yet. Click \"Extract Span Text\" to begin.</p>";
      saveBtn.disabled = true;
      return;
    }
    
    saveBtn.disabled = false;
    
    let html = "";
    Array.from(extractedTexts).forEach((text) => {
      html += `<div class="result-item">${text}</div>`;
    });
    
    resultsDiv.innerHTML = html;
  }

  function handleResults(results) {
    console.log("Handling results:", results);

    if (results && results.length > 0) {
      results.forEach((text) => extractedTexts.add(text));
      updateResultsDisplay();
    } else {
      console.log("No results to handle.");
    }
  }

  function extractSpansFromPage(filterClass) {
    // This is the function that will be injected into the page
    return `
      (function() {
        console.log("Extracting spans with filter: ${filterClass}");
        
        // Wait for page to be fully loaded
        if (document.readyState !== 'complete') {
          console.log("Page not fully loaded, waiting...");
          return JSON.stringify({
            texts: [],
            hasNextPage: false,
            needsReload: true,
            message: "Page not fully loaded yet"
          });
        }
        
        // More precise span detection
        let spans = [];
        
        if ("${filterClass}") {
          const lowerCaseFilterClass = "${filterClass}".toLowerCase();
          
          // Method 1: Direct class match (most precise)
          spans = Array.from(document.querySelectorAll("span[class*='" + lowerCaseFilterClass + "']"));
          
          // If no spans found, try checking class list more carefully
          if (spans.length === 0) {
            spans = Array.from(document.querySelectorAll("span")).filter((span) => {
              if (!span.className || typeof span.className !== 'string') return false;
              
              // Check if any class in the classList contains our filter
              const classList = span.className.split(/\s+/);
              return classList.some(cls => cls.toLowerCase().includes(lowerCaseFilterClass));
            });
          }
          
          // If still no spans, try a more targeted approach with divs and links
          if (spans.length === 0) {
            // Only look at elements that are likely to contain usernames
            spans = Array.from(document.querySelectorAll("span, a[href*='user'], div[class*='user']")).filter(el => {
              if (!el.className || typeof el.className !== 'string') return false;
              return el.className.toLowerCase().includes(lowerCaseFilterClass);
            });
          }
          
          console.log("Found " + spans.length + " spans with class containing: " + lowerCaseFilterClass);
        } else {
          spans = Array.from(document.querySelectorAll("span"));
          console.log("No filter provided, found " + spans.length + " total spans");
        }
        
        const texts = [];
        spans.forEach((span) => {
          const text = span.textContent.trim().replace(/@/g, "");
          if (text) {
            texts.push(text);
          }
        });
      
        console.log("Extracted " + texts.length + " texts");
        
        // More precise Next button detection
        const nextButtonCandidates = [];
        
        // Look for pagination elements first
        const paginationElements = document.querySelectorAll("nav[aria-label*='pagination'], div[class*='pagination'], ul[class*='pagination']");
        
        if (paginationElements.length > 0) {
          // If we found pagination elements, look for next buttons within them
          paginationElements.forEach(pagination => {
            const nextInPagination = Array.from(pagination.querySelectorAll('button, a')).find(el => {
              const text = el.textContent.trim().toLowerCase();
              const ariaLabel = el.getAttribute('aria-label') || '';
              return text === 'next' || 
                     text === '>' || 
                     text === '›' || 
                     text === 'next page' ||
                     ariaLabel.toLowerCase().includes('next');
            });
            
            if (nextInPagination) {
              nextButtonCandidates.push(nextInPagination);
            }
          });
        }
        
        // If no pagination-specific next button found, try general approach
        if (nextButtonCandidates.length === 0) {
          // Look for buttons/links with specific next-related text
          const nextButtons = Array.from(document.querySelectorAll('button, a')).filter(el => {
            const text = el.textContent.trim().toLowerCase();
            const ariaLabel = el.getAttribute('aria-label') || '';
            
            // Only match exact "next" or "next page" text, not any text containing "next"
            return text === 'next' || 
                   text === '>' || 
                   text === '›' || 
                   text === 'next page' ||
                   ariaLabel.toLowerCase().includes('next page');
          });
          
          nextButtonCandidates.push(...nextButtons);
        }
        
        // Choose the most likely next button
        let nextButton = null;
        let nextButtonInfo = "";
        if (nextButtonCandidates.length > 0) {
          // Prefer buttons in pagination elements
          nextButton = nextButtonCandidates[0];
          nextButtonInfo = nextButton ? "Found next button: " + nextButton.textContent.trim() + " (" + nextButton.outerHTML.substring(0, 100) + "...)" : "No next button found";
        }
        
        // Return as a JSON string to avoid serialization issues
        return JSON.stringify({
          texts: texts,
          hasNextPage: !!nextButton,
          message: nextButtonInfo
        });
      })();
    `;
  }

  function processPage(filterClass, accumulatedTexts = []) {
    if (!isExtractionRunning) {
      console.log("Extraction stopped by user");
      return;
    }
    
    resultsDiv.innerHTML = "<p>Extracting spans...</p>";
    
    // Execute the extraction script in the inspected window
    chrome.devtools.inspectedWindow.eval(
      extractSpansFromPage(filterClass),
      (resultStr, isException) => {
        if (!isExtractionRunning) {
          console.log("Extraction stopped by user during callback");
          return;
        }
        
        if (isException) {
          console.error("Error executing script:", isException);
          resultsDiv.innerHTML = `<p class="error">Error: ${isException.value || isException}</p>`;
          stopExtraction();
          return;
        }
        
        console.log("Raw extraction result:", resultStr);
        
        // Parse the JSON string result
        let result;
        try {
          result = JSON.parse(resultStr);
          console.log("Parsed extraction result:", result);
        } catch (e) {
          console.error("Error parsing result:", e);
          resultsDiv.innerHTML = `<p class="error">Error parsing result: ${e.message}</p>`;
          stopExtraction();
          return;
        }
        
        if (!result) {
          resultsDiv.innerHTML = "<p class='error'>No result returned from extraction</p>";
          stopExtraction();
          return;
        }
        
        // If page needs reload, wait and try again
        if (result.needsReload) {
          const statusMsg = document.createElement("div");
          statusMsg.className = "status-message";
          statusMsg.textContent = "Page not fully loaded. Waiting 3 seconds to try again...";
          resultsDiv.appendChild(statusMsg);
          
          extractionTimeout = setTimeout(() => {
            if (isExtractionRunning) {
              processPage(filterClass, accumulatedTexts);
            }
          }, 3000);
          return;
        }
        
        // Add the extracted texts to our accumulated texts
        if (result.texts && result.texts.length > 0) {
          result.texts.forEach(text => {
            if (!accumulatedTexts.includes(text)) {
              accumulatedTexts.push(text);
            }
          });
          
          // Update the UI with the current results
          handleResults(accumulatedTexts);
          
          // Add status message
          const statusMsg = document.createElement("div");
          statusMsg.className = "status-message";
          statusMsg.textContent = `Found ${result.texts.length} spans on this page.`;
          resultsDiv.appendChild(statusMsg);
        } else {
          const statusMsg = document.createElement("div");
          statusMsg.className = "status-message";
          statusMsg.textContent = "No spans found on this page.";
          resultsDiv.appendChild(statusMsg);
        }
        
        // If there's a next page, navigate to it and continue extraction
        if (result.hasNextPage) {
          const statusMsg = document.createElement("div");
          statusMsg.className = "status-message";
          statusMsg.textContent = `Found 'Next' button. Moving to next page in 10-15 seconds... (${result.message})`;
          resultsDiv.appendChild(statusMsg);
          
          // First, click the next button
          chrome.devtools.inspectedWindow.eval(
            `
            (function() {
              // Use the same detection logic as in the extraction function
              const nextButtonCandidates = [];
              
              // Look for pagination elements first
              const paginationElements = document.querySelectorAll("nav[aria-label*='pagination'], div[class*='pagination'], ul[class*='pagination']");
              
              if (paginationElements.length > 0) {
                // If we found pagination elements, look for next buttons within them
                paginationElements.forEach(pagination => {
                  const nextInPagination = Array.from(pagination.querySelectorAll('button, a')).find(el => {
                    const text = el.textContent.trim().toLowerCase();
                    const ariaLabel = el.getAttribute('aria-label') || '';
                    return text === 'next' || 
                           text === '>' || 
                           text === '›' || 
                           text === 'next page' ||
                           ariaLabel.toLowerCase().includes('next');
                  });
                  
                  if (nextInPagination) {
                    nextButtonCandidates.push(nextInPagination);
                  }
                });
              }
              
              // If no pagination-specific next button found, try general approach
              if (nextButtonCandidates.length === 0) {
                // Look for buttons/links with specific next-related text
                const nextButtons = Array.from(document.querySelectorAll('button, a')).filter(el => {
                  const text = el.textContent.trim().toLowerCase();
                  const ariaLabel = el.getAttribute('aria-label') || '';
                  
                  // Only match exact "next" or "next page" text, not any text containing "next"
                  return text === 'next' || 
                         text === '>' || 
                         text === '›' || 
                         text === 'next page' ||
                         ariaLabel.toLowerCase().includes('next page');
                });
                
                nextButtonCandidates.push(...nextButtons);
              }
              
              // Choose the most likely next button
              let nextButton = null;
              if (nextButtonCandidates.length > 0) {
                nextButton = nextButtonCandidates[0];
              }
              
              // Click the next button if found
              if (nextButton) {
                console.log("Clicking next button:", nextButton);
                nextButton.click();
                return true;
              }
              
              console.log("No next button found to click");
              return false;
            })();
            `,
            (clickResult, clickException) => {
              if (clickException) {
                console.error("Error clicking next button:", clickException);
                const errorMsg = document.createElement("div");
                errorMsg.className = "status-message";
                errorMsg.style.borderLeftColor = "#f44336";
                errorMsg.textContent = `Error clicking next button: ${clickException.value || clickException}`;
                resultsDiv.appendChild(errorMsg);
              } else {
                console.log("Next button click result:", clickResult);
                const clickMsg = document.createElement("div");
                clickMsg.className = "status-message";
                clickMsg.textContent = clickResult ? "Successfully clicked next button" : "Failed to click next button";
                resultsDiv.appendChild(clickMsg);
              }
              
              // Then wait for the random delay before processing the next page
              const randomDelay = Math.floor(Math.random() * 5000) + 10000; // Random delay between 10-15 seconds
              extractionTimeout = setTimeout(() => {
                if (isExtractionRunning) {
                  const delayMsg = document.createElement("div");
                  delayMsg.className = "status-message";
                  delayMsg.textContent = `Processing next page after ${(randomDelay/1000).toFixed(1)} second delay...`;
                  resultsDiv.appendChild(delayMsg);
                  processPage(filterClass, accumulatedTexts);
                }
              }, randomDelay);
            }
          );
        } else {
          // No more pages, we're done
          const statusMsg = document.createElement("div");
          statusMsg.className = "status-message";
          statusMsg.textContent = `Extraction complete! Found ${accumulatedTexts.length} total spans.`;
          resultsDiv.appendChild(statusMsg);
          stopExtraction();
        }
      }
    );
  }
  
  function stopExtraction() {
    isExtractionRunning = false;
    if (extractionTimeout) {
      clearTimeout(extractionTimeout);
      extractionTimeout = null;
    }
    extractBtn.disabled = false;
    stopBtn.style.display = "none";
  }

  extractBtn.addEventListener("click", () => {
    console.log("Extract button clicked");

    const filterClass = filterInput.value.trim();
    console.log("Filter class:", filterClass);

    // Clear previous results
    extractedTexts.clear();
    resultsDiv.innerHTML = "<p>Starting extraction...</p>";
    saveBtn.disabled = true;
    
    // Start the extraction process
    isExtractionRunning = true;
    extractBtn.disabled = true;
    stopBtn.style.display = "inline-block";
    processPage(filterClass, []);
  });
  
  stopBtn.addEventListener("click", () => {
    console.log("Stop button clicked");
    stopExtraction();
    
    const statusMsg = document.createElement("div");
    statusMsg.className = "status-message";
    statusMsg.textContent = "Extraction stopped by user.";
    resultsDiv.appendChild(statusMsg);
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

  chrome.devtools.panels.create(
    "Span Text Extractor", // Title of the panel
    "icons/icon48.png",    // Icon for the panel
    "devtools.html",       // HTML page to load into the panel
    function (panel) {
      // Code to execute on panel creation, if needed
    }
  );
}); 