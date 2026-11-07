// Save a string as a file in the browser's download folder, e.g. downloadText("program.hex", hexText).

export function downloadText(filename: string, content: string, mimeType = "text/plain"): void {
  // 1. Put the text in a Blob (an in-memory file) and get a temporary URL for it
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);

  // 2. Click a hidden <a download> link pointing at that URL
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();

  // 3. Clean up: remove the link and free the URL
  link.remove();
  URL.revokeObjectURL(url);
}
