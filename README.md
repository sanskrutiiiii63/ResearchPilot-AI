# ResearchPilot AI

Upload research papers, get structured AI summaries, compare them, find research gaps, and chat with your papers.
Each user signs in with Firebase Authentication and has private projects stored in Firestore.

## Requirements
- Node.js 18 or newer
- A free Firebase project
- (Optional) a Gemini API key from https://aistudio.google.com/apikey. Without one the AI features run in demo mode.

## 1. Firebase setup (one time)

Menu names in the Firebase console change occasionally, but the steps are the same.

1. Go to https://console.firebase.google.com and click **Add project**. Analytics is not needed.
2. **Authentication**: click Get started, then enable **Email/Password** and **Google** (pick a support email).
3. **Firestore Database**: click Create database, choose **production mode** and a region near you.
   Then open the **Rules** tab, paste the contents of `firestore.rules` and click Publish.
4. **Web app config** (for the frontend): Project settings (gear icon) > General > Your apps > click the
   web icon `</>` and register an app. Copy the four values into `client/.env`:
   `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`.
5. **Service account** (for the backend): Project settings > Service accounts > **Generate new private key**.
   Save the downloaded file as `server/serviceAccountKey.json`. It is already in `.gitignore`. Never commit it
   or share it.

## 2. Run

Terminal 1, backend:
```
cd server
npm install
npm run dev
```
Check http://localhost:5000/api/health. If Firebase is misconfigured the server prints what is wrong and exits.

Terminal 2, frontend:
```
cd client
npm install
npm run dev
```
Open http://localhost:5173, create an account, and create your first project.

## 3. Gemini (optional)
Set `GEMINI_API_KEY` in `server/.env` and restart the backend. If Google retires the model, change `GEMINI_MODEL`.

## How security works
- The browser signs in with Firebase and sends its ID token with every API call.
- The backend verifies the token, and every document stores `ownerId`. A user can only read or change their own data.
- `firestore.rules` blocks all direct browser access to Firestore, so only the backend can touch data.
- PDFs are never saved. Only the first 100,000 characters of extracted text are stored (for analysis and chat).
- Keys stay on the server. The Firebase web config in `client/.env` is public by design.

## Firestore collections
`users`, `projects` (includes research gaps), `papers`, `paperTexts`, `analyses`, `messages`.
Queries use equality filters only, so no composite indexes are required.

## Known limits
- Scanned PDFs (no text layer) are rejected. OCR is not supported yet.
- AI output can be wrong. Always verify against the original papers.
- AI rate limit is in server memory (12 requests per minute per user); it resets when the server restarts.

## Deploying later
Frontend: Vercel or Firebase Hosting (set the `VITE_*` variables). Backend: Render or similar. On the host, use
`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY` instead of the JSON file, set
`CLIENT_URL` to your frontend URL, and add that domain under Authentication > Settings > Authorized domains.
## 👥 Team & Work Distribution

ResearchPilot AI is a group project organized into four functional areas.

| Team Member | Assigned Responsibility | Scope |
|---|---|---|
| Sanskruti Wadkar | Integration & Documentation | Repository management, project integration, and documentation |
| Shruti Hagwanepatil | Frontend Development | React interface, dashboard, and user interactions |
| Ishwari Pardeshi | Backend Development | Express APIs, server-side logic, and database integration |
| Nihira Rawade | AI & PDF Processing | Gemini integration, research-paper analysis, and PDF-processing workflow |

### Collaboration Workflow

- GitHub repository for centralized source-code management.
- Branches for organizing changes by task.
- Commits for recording code and documentation changes.
- Pull requests for reviewing proposed changes before merging.
- Shared documentation for project setup and coordination.

*Note: The responsibilities above describe the team's planned work distribution. Individual contributions and completed tasks should be recorded accurately.*
