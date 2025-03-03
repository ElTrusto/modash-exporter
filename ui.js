export function updateResultsDisplay(extractedTexts, resultsDiv, resultCount, saveBtn) {
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

export function handleResults(results, extractedTexts, updateResultsDisplay) {
  console.log("Handling results:", results);

  if (results && results.length > 0) {
    results.forEach((text) => extractedTexts.add(text));
    updateResultsDisplay();
  } else {
    console.log("No results to handle.");
  }
} 