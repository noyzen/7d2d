import { settings } from '../state.js';

function renderAboutPage() {
    const aboutData = settings.aboutPage;
    document.getElementById('about-title').textContent = aboutData.title;
    document.getElementById('about-description').textContent = aboutData.description;
    document.getElementById('about-creator').textContent = aboutData.creator;
    document.getElementById('about-version').textContent = aboutData.version;
    const websiteEl = document.getElementById('about-website');
    websiteEl.textContent = aboutData.website;
    websiteEl.href = aboutData.website;
}

export function init() {
    renderAboutPage();
}
