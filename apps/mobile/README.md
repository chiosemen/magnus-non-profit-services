# Magnus Mobile - Authenticated MVP

React Native mobile client for Magnus Nonprofit OS.

## Features

- ✅ Password authentication
- ✅ Secure token storage (expo-secure-store)
- ✅ API client with session management
- ✅ Auth stack (Login)
- ✅ App stack (Home, Settings)
- ✅ Fail-closed on invalid/expired tokens
- ✅ Logout clears local token

## Setup

1. Install dependencies:
   ```bash
   pnpm install
   ```

2. Create `.env` file:
   ```bash
   cp .env.example .env
   ```

3. Configure API base URL in `.env`:
   ```
   EXPO_PUBLIC_API_BASE_URL=http://localhost:3000
   ```

## Development

Start the Expo development server:
```bash
pnpm start
```

Run on specific platform:
```bash
pnpm ios      # iOS simulator
pnpm android  # Android emulator
pnpm web      # Web browser
```

## Architecture

### Folder Structure

```
apps/mobile/
├── src/
│   ├── components/     # Reusable UI components
│   │   └── TabBar.tsx
│   ├── contexts/       # React contexts
│   │   └── AuthContext.tsx
│   ├── navigation/     # Navigation stacks
│   │   ├── AppStack.tsx
│   │   ├── AuthStack.tsx
│   │   └── RootNavigator.tsx
│   ├── screens/        # App screens
│   │   ├── HomeScreen.tsx
│   │   ├── LoginScreen.tsx
│   │   └── SettingsScreen.tsx
│   └── services/       # API & storage services
│       ├── api.ts
│       └── storage.ts
├── App.tsx             # Entry point
└── package.json
```

### Auth Flow

1. **App Launch**
   - AuthProvider checks for stored token
   - If valid token exists → verify with `/api/me`
   - If valid → show AppStack
   - If invalid/expired → clear token, show AuthStack

2. **Login**
   - User enters email/password
   - POST to `/api/login`
   - On success → save session token
   - Verify with `/api/me` → show AppStack

3. **Logout**
   - POST to `/api/auth/logout`
   - Clear local token
   - Return to AuthStack

### Security

- **Secure Storage**: Tokens stored in expo-secure-store (iOS Keychain / Android Keystore)
- **Fail-Closed**: Invalid/expired tokens trigger automatic logout
- **No Direct DB Access**: All data via authenticated API endpoints

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `EXPO_PUBLIC_API_BASE_URL` | Yes | `http://localhost:3000` | Backend API URL |

## Limitations (MVP)

- Basic UI (function over form)
- Password login only (no OAuth)
- Session token extraction from web redirect not implemented
- Limited error handling
- No offline support
- No push notifications

## Type Checking

```bash
pnpm typecheck
```

## License

UNLICENSED - Private
