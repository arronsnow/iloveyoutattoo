# I Love You Tattoo - Local Development

## Running Locally

### Option 1: Python (easiest)
```bash
cd iloveyou-tattoo
python3 -m http.server 8080
```
Then open: **http://localhost:8080**

### Option 2: VS Code Live Server
Right-click `index.html` → "Open with Live Server"

### Option 3: Node.js
```bash
npx serve .
```

---

## Project Structure

```
iloveyou-tattoo/
├── index.html            Homepage
├── css/
│   └── main.css          All styles + responsive
├── js/
│   └── main.js           Nav toggle, today hours, scroll reveal
├── images/
│   ├── hero-team.jpg     Hero background photo (add yours here!)
│   ├── shop-interior.jpg Used on About page
│   └── artists/
│       ├── jenni.jpg
│       ├── cory.jpg
│       ├── skylar.jpg
│       ├── millie.jpg
│       ├── gia.jpg
│       ├── remy.jpg
│       ├── eathan.jpg
│       └── zoie.jpg
└── pages/
    ├── about.html        The Shop
    ├── team.html         Full team page
    ├── booking.html      Book Tattoo / Piercing
    ├── aftercare.html    Aftercare instructions
    ├── piercing.html     Piercing gallery
    ├── guests.html       Guest artists (stub)
    ├── events.html       Events (stub)
    └── store.html        Store (stub)
```

## Adding Photos - two counts to bump

Most galleries discover photos automatically: the artists page probes for
`<prefix>_001.jpg` upward, so dropping a file into
`images/tattoo galleries/<artist>/` makes it appear with no code change.

**Two places use a hardcoded count instead**, because probing there would be
too slow, and they need updating when you add photos:

| Where | What to change | Why hardcoded |
|---|---|---|
| `index.html` - showcase tiles | `data-hi="26"` on that artist's `<img>` | The homepage picks one random image per artist. Probing 8 galleries to do it would cost ~240 requests on the busiest page. |
| `pages/about.html` - shop grid | `var TOTAL = 183;` | Same reason, across 183 shop photos. |

If a count is left too low the new photos simply never get picked - nothing
breaks. If set too high you'd get an occasional missing image, so keep it
accurate. Photo numbering must stay contiguous for this to work.

## Adding Your Photos

Drop images into the `images/` folder with these exact names:
- `images/hero-team.jpg` - the big team hero photo (already on the live site!)
- `images/artists/jenni.jpg` etc. - artist headshots or tattoo examples
- `images/shop-interior.jpg` - used on the About page

Any JPG, PNG, or WebP works. Recommended sizes:
- Hero: 1800 x 1000px minimum
- Artist cards: 600 x 600px (square crops work best)

## Google reviews

The homepage slider reads **`data/reviews.json`**. Add entries there and they
cycle automatically - no markup to touch. Past 8 reviews the dots are replaced
by an `n / 68` counter.

```json
{
  "author": "Sarah M.",
  "rating": 5,
  "text": "Incredible experience…",
  "date": "2025-03-14",
  "avatar": "images/reviews/sarah.jpg",
  "photos": ["images/reviews/sarah-1.jpg"],
  "url": "https://…"
}
```

Only `author`, `rating` and `text` are required. If the file fails to load,
the cards hardcoded in `index.html` are used instead, so the section never
renders empty.

### Why it isn't wired straight to Google

Two hard limits, not implementation shortcuts:

1. **Google's Places API returns a maximum of 5 reviews.** There is no
   pagination - it has been an open feature request since 2015. There is no
   way to reach 68 through it.
2. **Reviewer-uploaded photos are not attached to reviews** in any Google API.
   Place photos come back as a separate, unattributed list; nothing links a
   photo to the review it was posted with.

Scraping the Maps page would get both, and is against Google's Terms of
Service - it would also break without warning whenever they change their
markup. Not worth building on.

### Getting the real 68 in

| Route | Reviews | Reviewer photos | Effort |
|---|---|---|---|
| **Business Profile API → export to JSON** | all 68 | no | approval takes 2-4 weeks; then a script |
| **Review widget** (Featurable, Trustindex, Elfsight…) | all | usually yes | ~an hour; third-party script + their branding on free tiers |
| **Paste them in by hand** | all 68 | yes, if you save the images | a couple of hours, once |
| **Places API** | 5 only | no | small, but doesn't meet the brief |

The Business Profile API route is the clean one: a script fetches your reviews
(50 per page, paginated), writes `data/reviews.json`, and you re-run it
occasionally. It needs Google's approval - a written and video application.

Whichever you pick, keep the "N reviews · Read them all on Google" link in the
footer of the slider: Google requires attribution when displaying their review
content.

## Admin panel

**Triple-click the logo** in the top-left of any page (within ~1.5s) to open a
hidden sign-in. Signing in opens `/admin/`. The session lasts until you close
the browser tab.

### Accounts and roles

Accounts live in the `ACCOUNTS` list at the top of `js/admin.js`:

| Role | Theme editor | Profiles | Manage users | Owner accounts |
|---|---|---|---|---|
| `owner` | ✓ | any | ✓ | ✓ |
| `admin` | ✓ | any | ✓ | locked |
| `artist` | - | own only | - | - |

The shop owner should be an **admin** - that covers day-to-day running of the
site, including adding and removing staff logins.

`owner` is the developer/caretaker account. An admin can manage artists and
other admins but **cannot create, reset or delete an owner account**, so an
admin can't promote themselves or lock the owner out. Only an owner can touch
owner accounts.

Shipped with:

- **`arronsnow`** - owner. Temporary password `password`. **Change it:** sign
  in, use *Change my password*, and paste the new hash into `js/admin.js`.
- **`adminily`** - admin (the shop owner).

### Adding an artist login

Sign in as owner or admin → **Users** → enter a username, pick *Artist*, choose which
profile they may edit, set a password → **Add / update user** → paste the
generated `ACCOUNTS` block into `js/admin.js` and redeploy.

**There is no live user database.** Every account change - new user, role
change, password reset - produces a block of code you paste into
`js/admin.js`. Nothing takes effect until that file is deployed.

### What an artist can change

The **My profile** tool lets an artist edit their job title, styles, Instagram
handle and bio. It generates a block to paste into the `ARTISTS` list in
`pages/team.html`. Again: their edits are not live until someone commits that
file. Artists cannot upload photos - gallery images are files in
`images/tattoo galleries/<artist>/`.

If you want artists to genuinely self-serve, see **Going further** below.

### ⚠️ This is a hidden door, not a lock

The site is static - there is **no server** - so the sign-in runs entirely in
the visitor's browser. It keeps the panel out of sight of ordinary visitors.
It does **not** secure it. Anyone can get in by:

- viewing source and reading `js/admin.js`
- typing `/admin/` straight into the address bar and editing `sessionStorage`
- turning off JavaScript

The password itself is not in the source - only a SHA-256 fingerprint of
`username:password` - so it isn't readable at a glance, but a weak password
is trivially brute-forced offline. **Use a strong one.**

**To actually restrict `/admin/`, add authentication at the host.** Any of:

| Host | How |
|---|---|
| Netlify | Password-protect a path, or Netlify Identity + role gating |
| Cloudflare Pages | Cloudflare Access policy on `/admin/*` |
| Apache | `.htaccess` + `.htpasswd` in `admin/` |
| Nginx | `auth_basic` on a `location /admin/` block |

Until one of those is in place, treat everything under `/admin/` as public.

### Changing your own password

**Change my password** in the panel generates your replacement `ACCOUNTS` entry.
Paste it into `js/admin.js`. Passwords are never stored anywhere - only a
SHA-256 fingerprint of `username:password`.

Note: sign-in needs the site served over `http://localhost` or `https://`.
Opening the HTML as a `file://` path disables the browser crypto it relies on.

### Going further - real logins and real self-service

The paste-a-block workflow is fine for occasional changes by one or two people.
It will get old fast if several artists want to edit their own pages.

The usual fix for a static site like this is a **git-backed CMS** -
[Decap CMS](https://decapcms.org) (formerly Netlify CMS) is the common choice
and is free. It gives you:

- real per-user logins (GitHub OAuth or Netlify Identity), with roles
- an editing UI for bios, events and images - no code, no pasting
- image uploads that land in the repo
- every edit as a git commit, so changes are reviewable and revertible
- genuine access control, because auth happens before the editor loads

That would replace both this login and the paste-based tools. It's a
half-day-ish setup and needs the site hosted on Netlify (or similar) with the
repo on GitHub. Worth doing before handing logins to the whole shop.

## Customizing Colors & Fonts

### The theme editor (easiest)

Open **http://localhost:8080/admin/theme.html** with the site running.

- Pick colors with a color wheel and fonts from a dropdown; the preview
  on the right updates live. Switch which page you're previewing, and
  toggle desktop/mobile width.
- **Load a preset** - Brown & Gold (current), Brown · Gold · Green,
  Forest Green, or Navy & Gold.
- **Save to this browser** stores your theme in `localStorage` so you can
  browse the real site and live with the change for a while.
  ⚠️ This only affects *your* browser - visitors still see the shipped colors.
- **Export CSS →** gives you the finished `:root { … }` block. Paste it over
  the existing one in `css/main.css` to make it live for everyone.
- **Revert changes** clears your local theme and returns to the stylesheet.

The editor is a plain static page - there's no login on it, so don't deploy
`admin/` to production without putting access control in front of it.

### Editing the CSS by hand

Every colour and font on the site resolves from the `:root` block at the top
of `css/main.css`. Nothing is hardcoded elsewhere, so changing a token here
updates the whole site.

```css
--font-display: 'Playfair Display', serif;  /* headings */
--font-body:    'DM Sans', sans-serif;      /* nav, buttons, body */
--font-accent:  'Crimson Text', serif;      /* artist bios, quotes */

--bg:       #1a1208   /* page background */
--bg3:      #2c1f0a   /* panels, gallery cells */
--accent:   #b8892a   /* primary (gold) */
--accent2:  #62b87a   /* secondary (green) */
--cream:    #f2e8d0   /* heading text */
```

Borders, hover washes and hero scrims are **derived** with `color-mix()`:

```css
--border: color-mix(in srgb, var(--accent) 20%, transparent);
```

So they follow `--accent` automatically - change the accent and the whole
site's rules and outlines move with it. Don't replace these with fixed
values or that link is lost.

`--gold`, `--gold-lt` and `--gold-dim` are kept as aliases of the `--accent*`
tokens so older pages keep working.
