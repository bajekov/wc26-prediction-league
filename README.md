# World Cup 2026 Holme Hale Prediction League

Single-page prediction league. Data lives in Netlify Blobs via one
serverless function (`/api/league`). Results entry password is checked
server-side in `netlify/functions/league.mjs` (change `PW` there).

## Deploy
1. Push this folder to a GitHub repo.
2. Netlify dashboard -> Add new site -> Import an existing project -> pick the repo.
3. Build settings are read from netlify.toml automatically. Deploy.
4. Site Settings -> Change site name to something like holmehale.

Every `git push` redeploys. Predictions/results data is stored in Blobs,
separate from the code, so redeploys never touch it.
