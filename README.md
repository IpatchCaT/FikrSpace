# Fikr Study Desk

Fikr turns webpage content into editable study notes, saves studies and reference links in the current browser, and exports searchable PDFs. Religion Space suggests direct topic connections and thematic reflections from a small curated Quran and hadith collection. You can add your own citations and include the reflection in the study PDF. Generated study notes select excerpts and provide fields for your own paraphrases.

## Upload through GitHub in your browser

1. Extract the ZIP and open the `Fikr-GitHub` folder.
2. Open a **new, separate repository** on GitHub. A suggested name is `fikr-study-desk`. Initialize it with a README if you need the upload menu.
3. In the repository, click **Add file → Upload files**. Drag the files and folders **inside** `Fikr-GitHub` into the upload area. Keep `docs/` and `vendor/` as folders. You should see `README.md`, `package.json`, and `wrangler.jsonc` at the repository root. The ZIP itself is just the delivery package.
4. Review the upload and commit it. If you initialized the repo with a README, use the README supplied here.
5. If you plan to enable GitHub Pages, check that `docs/.nojekyll` was uploaded. If your file manager hid it, create a blank file with that path using **Add file → Create new file**. You can likewise add the root `.gitignore` if it was hidden.

[GitHub upload guide](https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository)

## Run the full app with automatic webpage extraction

GitHub stores the source. The full app needs a server-side Worker to fetch public webpages.

1. In the Cloudflare dashboard, open **Workers & Pages** and create a Worker by connecting your GitHub repository.
2. Name the Worker `fikr-study-desk` to match `wrangler.jsonc`. If you choose another name, edit the `name` field in GitHub before connecting it.
3. Select your repository's default branch and leave the root directory at the repository root. Leave the dashboard build command blank because `wrangler.jsonc` runs `npm run build`. Set the deploy command to `npx wrangler@4 deploy`.
4. Deploy and open the URL Cloudflare returns. Paste a public article link and choose **Generate study notes**. Use pasted text for sites that restrict automated access.

This package does not include the prior private hosting project's identity or login gate. A standard Worker URL is publicly reachable. Saved studies and reflections are local to each browser and site address. Existing studies on the ChatGPT-hosted version stay on that address.

[Cloudflare Workers Git integration](https://developers.cloudflare.com/workers/ci-cd/builds/) · [Build settings](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)

## Use GitHub Pages with pasted article text

1. Open the repository's **Settings → Pages**.
2. Under **Build and deployment**, select **Deploy from a branch**.
3. Choose your default branch and **/docs**, then save.
4. Open the URL GitHub provides. Use **Use pasted article text** to generate notes. You can also enter the article's URL to keep it as a reference. The Pages version supports saved studies, Religion Space and PDF download. Automatic URL extraction requires the Worker above.

For future edits to the Pages build, regenerate the checked-in `docs/` folder with `npm run build` before uploading the revised files. The initial Pages files are already built.

[GitHub Pages publishing source](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

## Source files

- `index.html` and `app.js` contain the interface, study logic, Religion Space and PDF generation.
- `worker.mjs` serves the full app and handles public webpage requests.
- `build.mjs` generates the Worker and GitHub Pages files.
- `dev.mjs` provides a local server. If you have Node.js, run `npm run dev` and open `http://localhost:4173`.
- `vendor/` contains the bundled PDF libraries and font. Keep the accompanying license files when redistributing.

## Quick check

Generate a study using **Try a sample**. Open **Explore Quran & Hadith** and enter “Do kind words change water crystals?” Review the results, enable **Include Religion Space in this study PDF**, and use **Preview & download PDF** from the study.
