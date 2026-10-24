# EqSplit

Shared expense tracker for small groups. Works offline and syncs when back online.

## Setup

### Firebase
1. Create a project at console.firebase.google.com.
2. Authentication → Sign-in method → enable **Email/Password**.
3. Authentication → Settings → Authorized domains → add your GitHub Pages domain.
4. Firestore Database → create database.
5. Firestore → Rules → paste `firestore.rules` → Publish.
6. Project settings → Your apps → Web app → copy the config into `src/firebaseConfig.ts`.

### GitHub Pages
Settings → Pages → Source: **GitHub Actions**. Pushing to `main` deploys.

## Usage
- First visit: **Set up EqSplit** creates the admin account.
- Admin creates groups and adds members by name; each group has a join code.
- Members enter the code, pick their name and set a password.
- Forgotten password: admin → Account → Manage people → Reset login.

## Development
```bash
npm install
npm run dev
npm run build
```
