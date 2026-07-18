# Google Form Setup & Data Export Instructions

To gather feedback from your 50+ onboarded testnet users, you must set up a Google Form containing the exact fields detailed below. Every field is required to prevent a rejection.

## Mandatory Google Form Fields

Create a new Google Form with the following fields:

1. **Full Name** (Short answer, Required)
   * *Description*: Please enter your full name as used for onboarding tracking.
2. **Email** (Short answer, Required)
   * *Description*: Please enter your active email address.
3. **Wallet Address** (Short answer, Required)
   * *Description*: Please enter your Stellar public address (G...) used to execute transactions on ChainKitty.
4. **Network used** (Dropdown, Required)
   * *Options*:
     * Testnet
     * Mainnet
5. **Product Rating** (Linear scale 1-5, Required)
   * *Label 1*: Extremely poor UX / Buggy
   * *Label 5*: Highly polished / Excellent
6. **Which feature did you like the most?** (Paragraph, Required)
   * *Description*: E.g., Onboarding Wizard, Group Discovery, Reputation Display, Deadline Reminder Banners, etc.
7. **What feature do you think is missing?** (Paragraph, Required)
   * *Description*: What improvements or additions should we prioritize next?
8. **Did you encounter any bugs or usability issues?** (Paragraph, Required)
   * *Description*: List any specific errors or visual glitches you noticed.
9. **Would you recommend this product to others?** (Multiple choice, Required)
   * *Options*:
     * Yes, absolutely
     * No, not in its current state
10. **What improvements would you like to see?** (Paragraph, Required)
    * *Description*: Any other constructive feedback or architectural suggestions.

---

## Instructions: Exporting Responses to Google Sheets

1. Open your **Google Form** in edit mode.
2. Click on the **Responses** tab at the top of the form.
3. Click the green **Link to Sheets** button (or click the three vertical dots and select *Select destination for responses* -> *Create a new spreadsheet*).
4. Google will generate a new Google Sheet automatically linked to this form. Whenever a user submits the form, a row is added in real-time.
5. In the Google Sheet, click **File** in the top menu.
6. Select **Share** -> **Share with others**.
7. Under *General access*, click the dropdown (which currently says "Restricted") and select **Anyone with the link**.
8. Ensure the role dropdown on the right is set to **Viewer** (do NOT set to Editor).
9. Click **Copy link**, then click **Done**.
10. Paste this public view-only link into the `README.md` file under the Google Form section.
