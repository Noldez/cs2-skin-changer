# CS2 Skin Changer

A local web UI for applying CS2 weapon cosmetics via the [WeaponSkin](https://github.com/Noldez/WeaponSkin) ModSharp plugin.

## Screenshot

<!-- Add screenshot here -->

## Features

- Browse and apply **weapon paint skins** (Rifles, Pistols, SMGs, Heavy) with wear, seed, name tag and StatTrak
- **Knife skins** — pick knife type and skin
- **Gloves**
- **Agents** (CT & T side)
- **Music kits**
- **Custom model skins** — load custom `.vmdl` workshop skins
- Changes take effect on next spawn/reconnect — no server restart needed

## Requirements

- Node.js 18+
- MySQL (or adjust `server.js` for SQLite/PostgreSQL)
- [WeaponSkin](https://github.com/Noldez/WeaponSkin) plugin running on your CS2 server

## Setup

```bash
git clone https://github.com/Noldez/cs2-skin-changer.git
cd cs2-skin-changer
npm install
cp .env.example .env
# Edit .env with your database credentials
node server.js
```

Open `http://localhost:3000` in your browser.

## Configuration

### `.env`
```
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=weaponskin
```

### Custom skins (`custom_skins.json`)
Add custom model skins to the Custom tab:
```json
[
  {
    "id": "unique_id",
    "name": "Display Name",
    "weapon_defindex": 60,
    "weapon_name": "M4A1-S",
    "model_path": "weapons/author/model/model.vmdl",
    "image": null,
    "author": "authorname"
  }
]
```
