# Android permissions — SportMind AI

Source of truth: `app.json` → `expo.android.blockedPermissions`. The release manifest is checked
with `aapt2 dump permissions <apk>` (not by reading config).

## Declared in the release build
| Permission | Why |
|---|---|
| `android.permission.INTERNET` | Reads match data from Supabase. |
| `android.permission.ACCESS_NETWORK_STATE` | Added by React Native networking. |
| `android.permission.VIBRATE` | Added by React Native (`Vibration`/haptics APIs). |

## Blocked on purpose (removed from the merged manifest)
| Permission | Origin | Why it is not needed |
|---|---|---|
| `com.android.vending.BILLING` | `react-native-purchases` | Purchases are hidden and disabled (`PURCHASES_ENABLED = false`); the SDK is never configured. |
| `android.permission.READ_EXTERNAL_STORAGE` | Expo prebuild default | No code reads shared storage. "Export my data" shares text through the system share sheet (`Share.share`) and writes no file. |
| `android.permission.WRITE_EXTERNAL_STORAGE` | Expo prebuild default | Same. |
| `android.permission.SYSTEM_ALERT_WINDOW` | Expo/React Native dev-menu default | Only the debug overlay uses it; there is no overlay in the product. |

## Re-enabling purchases later
1. Set `PURCHASES_ENABLED = true` in `constants/featureFlags.ts`.
2. **Remove `com.android.vending.BILLING` from `blockedPermissions` in `app.json`.** Without it the
   merged manifest has no Billing permission and purchases cannot start.
3. Provide `EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID` in the EAS production environment.
4. Update the Privacy Policy, Data Safety form and store listing (purchase history, device ID).
