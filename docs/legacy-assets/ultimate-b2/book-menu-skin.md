# Ultimate B2 book-menu skin

The exact unit and edition controls come from the standalone HD texture atlas `Contents/Resources/assets/books/book1/book_menu/HD/book_atlas.png` (1934×999, SHA-256 `1f776a9c6b452ab677e5afb4c1dbb2084f44a7e27121b59e5fa23dd297744ed7`). Its machine-readable coordinates are in `Contents/Resources/assets/books/book1/book_menu/HD/book_atlas.xml` (SHA-256 `1e7d34dfbc85baf8cfea48607b26d4f18bcab1cefaa046e80290dc218c750be2`). No crop coordinate is inferred from pixels.

The strictly decoded `Contents/Resources/assets/books/book1/book_menu/common/book1_params.iwb` (SHA-256 `b698deeaa6156ea743710718e3747e2f71b365a1a9d11f4f31ae8db8c0c21c81`) maps each control as `a,b,b`: the `a` region is normal and the `b` region is used for both hover and pressed. It also declares the visible layout as Units 1–5 on the left, Units 6–10 on the right, and Workbook / Grammar Book / Extras along the bottom.

The tracked recovery contains 26 native HD crops:

- `button_01a` through `button_10b`: ten 360×93 unit buttons, each with normal and hover/pressed artwork.
- `button_12a` through `button_14b`: Workbook, Grammar Book, and Extras controls, each 301×99 with normal and hover/pressed artwork.

They are stored under `legacy-classroom-ui/book-menu/`. The source atlas and `.app` remain untracked. Run `node scripts/ultimate-b2/recover-book-menu-assets.mjs "Ultimate English B2.app"` for a read-only verification report, or add `--write` to reproduce the exact crops and their manifest entries.
