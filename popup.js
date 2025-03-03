document.addEventListener("DOMContentLoaded", () => {
  const extractBtn = document.getElementById("extractBtn")
  const saveBtn = document.getElementById("saveBtn")
  const resultsDiv = document.getElementById("results")
  const resultCount = document.getElementById("resultCount")
  const filterInput = document.getElementById("filterInput")

  let extractedTexts = []

  // Extract text from spans when button is clicked
  extractBtn.addEventListener("click", () => {
    const filterClass = filterInput.value.trim()

    // Reset results
    extractedTexts = []
    resultsDiv.innerHTML = "<p>Extracting...</p>"
    saveBtn.disabled = true

    // Execute content script in the active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.scripting.executeScript(
        {
          target: { tabId: tabs[0].id },
          function: extractSpanText,
          args: [filterClass],
        },
        handleResults,
      )
    })
  })

  // Save results to a file
  saveBtn.addEventListener("click", () => {
    if (extractedTexts.length === 0) return

    const textToSave = extractedTexts.join("\n")
    const blob = new Blob([textToSave], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-")

    chrome.downloads.download({
      url: url,
      filename: `span-text-${timestamp}.txt`,
      saveAs: true,
    })
  })

  // Handle results from content script
  function handleResults(results) {
    if (!results || results.length === 0) {
      resultsDiv.innerHTML = '<p class="no-results">Error executing script</p>'
      return
    }

    const result = results[0].result
    extractedTexts = result

    if (extractedTexts.length === 0) {
      resultsDiv.innerHTML = '<p class="no-results">No span elements found</p>'
      resultCount.textContent = "0"
      return
    }

    // Display results
    resultsDiv.innerHTML = ""
    extractedTexts.forEach((text) => {
      const div = document.createElement("div")
      div.className = "result-item"
      div.textContent = text
      resultsDiv.appendChild(div)
    })

    resultCount.textContent = extractedTexts.length
    saveBtn.disabled = false
  }
})

// This function runs in the context of the web page
function extractSpanText(filterClass) {
  let spans

  if (filterClass) {
    spans = document.querySelectorAll(`span.${filterClass}`)
  } else {
    spans = document.querySelectorAll("span")
  }

  const texts = []
  spans.forEach((span) => {
    if (span.textContent.trim()) {
      texts.push(span.textContent.trim())
    }
  })

  return texts
}

