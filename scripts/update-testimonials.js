#!/usr/bin/env node

/**
 * Scrapes testimonials from love.techimpossible.com and updates index.html
 *
 * Usage: node scripts/update-testimonials.js
 */

const fs = require('fs');
const path = require('path');

async function scrapeTestimonials() {
  const puppeteer = require('puppeteer');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.goto('https://love.techimpossible.com/all', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    // Wait for testimonials to load in iframe
    await page.waitForSelector('iframe', { timeout: 10000 });

    // Get the iframe
    const iframeElement = await page.$('iframe');
    const iframe = await iframeElement.contentFrame();

    // Wait for testimonials to render
    await iframe.waitForSelector('blockquote', { timeout: 10000 });

    // Extract testimonials
    const testimonials = await iframe.evaluate(() => {
      const items = [];
      const testimonialElements = document.querySelectorAll('blockquote');

      testimonialElements.forEach(blockquote => {
        const container = blockquote.closest('[class*="flex-col"]') || blockquote.parentElement.parentElement;

        // Get the text content
        const textEl = blockquote.querySelector('div > div') || blockquote.querySelector('div');
        const text = textEl ? textEl.textContent.replace('Show more', '').trim() : '';

        // Get author info - look for the link with name
        const nameLink = container.querySelector('a[href]');
        const name = nameLink ? nameLink.textContent.trim() : '';

        // Get company/title - usually in a paragraph near the name
        const companyEl = container.querySelector('p');
        const company = companyEl ? companyEl.textContent.trim() : '';

        if (text && name) {
          items.push({ name, company, text });
        }
      });

      return items;
    });

    return testimonials;
  } finally {
    await browser.close();
  }
}

function truncateText(text, maxLength = 250) {
  if (text.length <= maxLength) return text;
  const truncated = text.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  return truncated.substring(0, lastSpace) + '...';
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function generateTestimonialHTML(testimonials) {
  const items = testimonials.map((t, index) => {
    const name = escapeHtml(t.name);
    const company = t.company ? escapeHtml(t.company) : '';
    const text = escapeHtml(truncateText(t.text, 250));
    const activeClass = index === 0 ? ' active' : '';

    return `                <div class="testimonial${activeClass}">
                    <p class="testimonial-text">"${text}"</p>
                    <p class="testimonial-author"><strong>${name}</strong>${company ? ' — ' + company : ''}</p>
                </div>`;
  }).join('\n');

  const dots = testimonials.map((_, index) => {
    const activeClass = index === 0 ? ' active' : '';
    return `                <span class="testimonial-dot${activeClass}" data-index="${index}"></span>`;
  }).join('\n');

  return { items, dots };
}

function updateIndexHTML(testimonials) {
  const indexPath = path.join(__dirname, '..', 'index.html');
  let html = fs.readFileSync(indexPath, 'utf8');

  const { items, dots } = generateTestimonialHTML(testimonials);

  // Replace the testimonial slider content
  const sliderRegex = /(<div class="testimonial-slider">)[\s\S]*?(<\/div>\s*<div class="testimonial-dots">)/;
  html = html.replace(sliderRegex, `$1\n${items}\n            $2`);

  // Replace the dots
  const dotsRegex = /(<div class="testimonial-dots">)[\s\S]*?(<\/div>\s*<\/section>)/;
  html = html.replace(dotsRegex, `$1\n${dots}\n            $2`);

  fs.writeFileSync(indexPath, html);
  console.log(`Updated index.html with ${testimonials.length} testimonials`);
}

async function main() {
  console.log('Scraping testimonials from love.techimpossible.com...\n');

  try {
    const testimonials = await scrapeTestimonials();

    if (!testimonials || testimonials.length === 0) {
      console.log('No testimonials found');
      return;
    }

    console.log(`Found ${testimonials.length} testimonials:`);
    testimonials.forEach(t => console.log(`  - ${t.name}: "${t.text.substring(0, 50)}..."`));

    // Take up to 5
    const displayTestimonials = testimonials.slice(0, 5);

    updateIndexHTML(displayTestimonials);
    console.log('\nDone!');
  } catch (err) {
    console.error('Error scraping testimonials:', err.message);
    // Don't exit with error - testimonials are optional
  }
}

main();
