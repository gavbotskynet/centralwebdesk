import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage();

await page.goto('https://bulletfinity.com/b/claude-code-course-6pr4d8p7o7');
await page.waitForTimeout(3000); // wait for JS to render

// Get the embedded data from the script tag
const data = await page.evaluate(() => {
  const scripts = document.querySelectorAll('script');
  for (const script of scripts) {
    if (script.textContent.includes('bulletTree')) {
      // Extract the data object
      const match = script.textContent.match(/data:\s*(\[.*?\])/s);
      if (match) {
        try {
          return JSON.parse(match[1]);
        } catch (e) {
          // try alternate extraction
        }
      }
    }
  }
  return null;
});

console.log(JSON.stringify(data, null, 2));
await browser.close();
