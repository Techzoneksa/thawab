# Mobile QA Checklist — ثواب

## Prep
- [ ] Run `npm run dev` or `npm run preview`
- [ ] Open on **iPhone Safari** (12/13/14/15/SE) + **Android Chrome** (Samsung/Google Pixel)
- [ ] Add to Home Screen on iPhone to test PWA chrome-less mode

---

## 1. Global Layout (every page)

| # | Test | iPhone | Android | Pass |
|---|------|--------|---------|------|
| 1.1 | No horizontal scroll on any page | | | |
| 1.2 | Content not hidden behind bottom nav (scroll to very bottom) | | | |
| 1.3 | Content not hidden behind iPhone notch (top of page) | | | |
| 1.4 | Tap targets feel comfortable (not too small, ≥44px) | | | |
| 1.5 | Arabic RTL text alignment correct everywhere | | | |
| 1.6 | Touch feedback (tap highlight, opacity change) on interactive elements | | | |

## 2. Header / Topbar

| # | Test | iPhone | Android | Pass |
|---|------|--------|---------|------|
| 2.1 | Page title shown correctly for current route | | | |
| 2.2 | Hamburger menu opens sidebar | | | |
| 2.3 | Search icon visible | | | |
| 2.4 | Notification bell (+ dot if unread) visible | | | |
| 2.5 | User avatar/initials visible | | | |

## 3. Bottom Navigation

| # | Test | iPhone | Android | Pass |
|---|------|--------|---------|------|
| 3.1 | 5 items visible: الرئيسية, التبرعات, المشاريع, الموافقات, المزيد | | | |
| 3.2 | Active item highlighted | | | |
| 3.3 | Tapping navigates to correct route | | | |
| 3.4 | Not hidden behind iPhone home indicator | | | |
| 3.5 | "المزيد" opens bottom sheet with remaining nav items | | | |

## 4. Sidebar / Drawer

| # | Test | iPhone | Android | Pass |
|---|------|--------|---------|------|
| 4.1 | Opens from hamburger | | | |
| 4.2 | Closes via backdrop tap or X button | | | |
| 4.3 | All nav items visible and tappable (≥44px) | | | |
| 4.4 | Sub-menus (المالية, المشتريات, إلخ) expand/collapse | | | |
| 4.5 | Logout button at bottom works | | | |
| 4.6 | Logo and app name displayed at top | | | |
| 4.7 | Scrollable if content overflows | | | |

## 5. MobileFilterDrawer (bottom sheet)

| # | Page | Test | Pass |
|---|------|------|------|
| 5.1 | Donations | Open → select filter → close → reopen | |
| 5.2 | Beneficiaries | Open → select filter → close | |
| 5.3 | Projects | Open → select filter → close | |
| 5.4 | Approvals | Open → select filter → close | |
| 5.5 | Reports | Open → select filter → close | |
| 5.6 | Donors | Open → select filter → close | |
| 5.7 | Audit | Open → select filter → close | |
| 5.8 | Finance Ledger | Open → select filter → close | |
| 5.9 | Procurement Requests | Open → select filter → close | |

## 6. Mobile Cards (table pages on mobile)

| # | Page | Test | Pass |
|---|------|------|------|
| 6.1 | Dashboard | Transaction cards, project cards, alert cards render | |
| 6.2 | Donations | Each donation as a card, all data visible | |
| 6.3 | Donors | Each donor as a card | |
| 6.4 | Beneficiaries | Each beneficiary as a card | |
| 6.5 | Projects | Grid toggle works (grid/table view) | |
| 6.6 | All table pages | Cards show key data, no text clipping | |

## 7. Forms

| # | Page | Test | Pass |
|---|------|------|------|
| 7.1 | Settings → Org | Input fields ≥44px, sticky save bar visible above bottom nav | |
| 7.2 | Settings → Users | Role dropdown, save button | |
| 7.3 | Approvals | Bottom action sheet with اعتماد / رفض buttons | |
| 7.4 | All inputs | Focus state visible, keyboard doesn't break layout | |

## 8. Detail Pages

| # | Page | Test | Pass |
|---|------|------|------|
| 8.1 | Donors → [ID] | MobileTabBar works (tabs scroll horizontally, 44px tall) | |
| 8.2 | Projects → [ID] | MobileTabBar works, task checkboxes are 44×44 | |

## 9. Charts & Reports

| # | Page | Test | Pass |
|---|------|------|------|
| 9.1 | Dashboard | Cash flow chart renders without overflow | |
| 9.2 | Reports | Grid cards wrap correctly | |
| 9.3 | Endowment returns | Bar chart scrollable horizontally | |

## 10. Desktop Regression (1024px+)

| # | Test | Pass |
|---|------|------|
| 10.1 | Sidebar visible instead of bottom nav | |
| 10.2 | Desktop header (search, org badge, AI button) visible | |
| 10.3 | Tables render (not cards) | |
| 10.4 | FilterBar shows all inline filters | |
| 10.5 | Full layout matches pre-mobile design | |

---

## Sign-off

**Tested by:** _________________ **Date:** _________________

**Notes / Issues Found:**
```
________________________________________________________________
________________________________________________________________
________________________________________________________________
```

**Pass / Fail:** _________________
