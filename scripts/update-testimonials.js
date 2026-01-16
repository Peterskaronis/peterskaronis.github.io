#!/usr/bin/env node

/**
 * Fetches testimonials from Testimonial.to API and updates index.html
 *
 * Usage: TESTIMONIAL_API_KEY=xxx node scripts/update-testimonials.js
 *
 * Requires the TESTIMONIAL_API_KEY environment variable to be set.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const API_URL = 'https://api.testimonial.to/v1/testimonials?liked=true';

function fetch(url, apiKey) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    };

    https.get(url, options, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`API returned status ${res.statusCode}`));
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('Failed to parse JSON response'));
        }
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

function truncateText(text, maxLength = 200) {
  if (text.length <= maxLength) return text;
  // Find the last space before maxLength
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
    const name = escapeHtml(t.name || 'Anonymous');
    const title = t.jobTitle ? escapeHtml(t.jobTitle) : '';
    const company = t.company ? escapeHtml(t.company) : '';
    const authorLine = [name, title, company].filter(Boolean).join(', ');
    const text = escapeHtml(truncateText(t.text || '', 250));
    const activeClass = index === 0 ? ' active' : '';

    return `                <div class="testimonial${activeClass}">
                    <p class="testimonial-text">"${text}"</p>
                    <p class="testimonial-author"><strong>${name}</strong>${company ? ' — ' + (title ? title + ', ' : '') + company : ''}</p>
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
  const apiKey = process.env.TESTIMONIAL_API_KEY;

  if (!apiKey) {
    console.log('TESTIMONIAL_API_KEY not set, skipping testimonial update');
    return;
  }

  console.log('Fetching testimonials from Testimonial.to...\n');

  try {
    const testimonials = await fetch(API_URL, apiKey);

    if (!Array.isArray(testimonials) || testimonials.length === 0) {
      console.log('No testimonials found');
      return;
    }

    // Filter to only text testimonials with content
    const textTestimonials = testimonials.filter(t => t.text && t.text.trim());

    console.log(`Found ${textTestimonials.length} text testimonials`);

    if (textTestimonials.length === 0) {
      console.log('No text testimonials to display');
      return;
    }

    // Take up to 5 most recent
    const displayTestimonials = textTestimonials.slice(0, 5);

    updateIndexHTML(displayTestimonials);
    console.log('\nDone!');
  } catch (err) {
    console.error('Error fetching testimonials:', err.message);
    // Don't exit with error - testimonials are optional
  }
}

main();
