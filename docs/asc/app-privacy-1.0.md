# App Privacy for version 1.0: click-by-click checklist (App Store Connect website)

This matches `ios/HighPriestess/Resources/PrivacyInfo.xcprivacy` and https://grepawk.com/high-priestess/privacy as of build 2 and later. Apple has no API for these answers, so they have to be entered in the website. It takes about 5 minutes.

**The final result has 4 data types, all "Data Linked to You", none used for tracking:**
Identifiers (User ID), Purchases (Purchase History), User Content (Gameplay Content), Usage Data (Product Interaction).

---

## 0. Open the page
1. Go to https://appstoreconnect.apple.com and sign in.
2. Click **Apps**, then **Temple of the High Priestess**.
3. In the left sidebar, under **General**, click **App Privacy**.

## 1. Privacy Policy URL
1. Next to **Privacy Policy**, click **Edit**.
2. Under **Privacy Policy URL**, enter: `https://grepawk.com/high-priestess/privacy`
3. Leave **User Privacy Choices URL** empty.
4. Click **Save**.

## 2. Start the questionnaire
1. Under **Data Collection**, click **Get Started**. If answers already exist, click **Edit** instead.
2. Question "Do you or your third-party partners collect data from this app?": select **Yes, we collect data from this app**.
3. Click **Next**.

## 3. Pick the data types (check exactly these 4, nothing else)
| Section on the page | Check |
|---|---|
| Contact Info | (nothing) |
| Health & Fitness | (nothing) |
| Financial Info | (nothing). Payment details stay with Apple. |
| Location | (nothing) |
| Sensitive Info | (nothing) |
| Contacts | (nothing) |
| User Content | ☑ **Gameplay Content** |
| Browsing History / Search History | (nothing) |
| Identifiers | ☑ **User ID**. Do **not** check Device ID: we never read the IDFA or IDFV. |
| Purchases | ☑ **Purchase History** |
| Usage Data | ☑ **Product Interaction**. Do not check Advertising Data or Other Usage Data. |
| Diagnostics | (nothing). There's no crash/performance SDK yet. Revisit if MetricKit telemetry ships. |
| Surroundings / Body / Other Data | (nothing) |

Then click **Save**.

## 4. Set up each data type
Each of the 4 types now shows a **Set Up** button. For each one, click it and answer the three screens as follows.

### 4a. User ID
1. Purposes: ☑ **App Functionality** only. Click **Next**.
2. "Is User ID linked to the user's identity?": **Yes, User ID is linked to the user's identity**. Click **Next**.
3. "Do you or your third-party partners use User ID for tracking purposes?": **No**. Click **Save**.

### 4b. Gameplay Content
1. Purposes: ☑ **App Functionality** only. Click **Next**.
2. Linked to identity: **Yes**. Click **Next**.
3. Tracking: **No**. Click **Save**.

### 4c. Purchase History
1. Purposes: ☑ **App Functionality** only. Click **Next**.
2. Linked to identity: **Yes**. Click **Next**.
3. Tracking: **No**. Click **Save**.

### 4d. Product Interaction
1. Purposes: ☑ **Analytics** only. Not Developer's Advertising, not Third-Party Advertising, not Product Personalization. Click **Next**.
2. Linked to identity: **Yes**. Click **Next**.
3. Tracking: **No**. Click **Save**.

## 5. Publish
1. Click **Publish** (top right), then confirm.
2. Check the **Product Page Preview** on the right. It should show:
   - **Data Used to Track You**: *(none / section absent)*
   - **Data Linked to You**: Purchases, User Content, Identifiers, Usage Data
   - **Data Not Linked to You**: *(none)*

---

### Why these answers (for reference)
- **User ID**: a random install/player ID that the app generates (Keychain). It's not the Apple ID, IDFA or IDFV.
- **Gameplay Content**: cloud save slots and game settings (sync and backup).
- **Purchase History**: the App Store's signed transactions plus refund notices, so purchases unlock and restore and refunds re-lock.
- **Product Interaction**: four first-party events (`paywall_shown`, `purchase`, `restore`, `region_complete`, with placement, product, price-test arm, price, app version). They're stored on our server only, used as aggregates, and kept 13 months.
- Not declared: **Game Center** data (Apple processes it, and our server never receives any Game Center identifiers) and IP addresses in short-lived web server logs (not collected as data). There are no third-party SDKs.
- Deletion: Settings, then Delete cloud data, removes all of the above from our server.
