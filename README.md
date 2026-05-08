# AvantaPrint

Клиентский сайт (Next.js, статический экспорт) на **GitHub Pages** + бэкенд на **вашем ПК** (FastAPI, Telegram-бот, хранение файлов). Сайт ходит к API по публичному URL туннеля (например **Cloudflare Tunnel / cloudflared**).

**Важно:** токен Telegram-бота нельзя публиковать в репозитории и в чатах. Если токен засветился — отзовите его в [@BotFather](https://t.me/BotFather) (`/revoke`) и создайте новый.

## Структура

- `frontend/` — Next.js 15, `output: 'export'`
- `backend/` — FastAPI, python-telegram-bot, APScheduler, TinyDB, конвертация в PDF (LibreOffice + Pillow/ReportLab + PyMuPDF)

## Локальный бэкенд (ПК типографии)

### 1. Зависимости

- Python 3.11+
- [LibreOffice](https://www.libreoffice.org/) (для Word/Excel/PowerPoint → PDF). В Windows укажите путь в `.env`: `LIBREOFFICE_PATH=C:\Program Files\LibreOffice\program\soffice.exe`

### 2. Настройка

```powershell
cd backend
copy .env.example .env
```

Заполните в `.env`:

| Переменная | Описание |
|------------|----------|
| `JWT_SECRET` | Длинная случайная строка |
| `ADMIN_PASSWORD_HASH` | bcrypt-хеш пароля админа (по умолчанию в примере — для пароля `AvantaGuccinPrint`) |
| `BOT_TOKEN` | Токен от BotFather |
| `BOT_REGISTRATION_SECRET` | Секрет для команды `/start <секрет>` |
| `CORS_ORIGINS` | Origin GitHub Pages, напр. `https://ВАШ_ЛОГИН.github.io` (можно несколько через запятую) |

Сгенерировать новый bcrypt-хеш пароля (если меняете пароль):

```powershell
py -3 -c "import bcrypt; print(bcrypt.hashpw(b'ВАШ_ПАРОЛЬ', bcrypt.gensalt()).decode())"
```

Подставьте результат в `ADMIN_PASSWORD_HASH`.

### 3. Запуск API + бота

```powershell
cd backend
py -3 -m pip install -r requirements.txt
py -3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Или `run.bat` из папки `backend`.

- API: `http://127.0.0.1:8000`
- Проверка: `GET http://127.0.0.1:8000/api/health`

### 4. Туннель к вашему ПК

Установите [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/). Пример быстрого туннеля:

```powershell
cloudflared tunnel --url http://localhost:8000
```

Скопируйте выданный `https://....trycloudflare.com` — это базовый URL API для фронтенда.

### 5. Регистрация Telegram

В Telegram откройте своего бота и отправьте:

```
/start ВАШ_BOT_REGISTRATION_SECRET
```

После этого уведомления о заказах будут приходить в этот чат.

## GitHub Pages (фронтенд)

1. Создайте репозиторий на GitHub и запушьте код.
2. **Settings → Pages**: источник — **GitHub Actions**.
3. **Settings → Secrets and variables → Actions**:
   - `NEXT_PUBLIC_API_URL` — URL туннеля **без** завершающего `/`, например `https://abc.trycloudflare.com`

Workflow [.github/workflows/deploy-pages.yml](.github/workflows/deploy-pages.yml) собирает фронт с:

- `NEXT_PUBLIC_BASE_PATH` = `/<имя_репозитория>` (для project pages `username.github.io/repo-name`)

Сайт будет доступен по адресу:

`https://<username>.github.io/<repo>/`

Главная: `/`, админ: `/administrator` (логин по умолчанию из ТЗ: **AvantaPrint** / **AvantaGuccinPrint**, если не меняли хеш).

## GitHub Actions и бот

- Actions **только деплоит статический фронт** на Pages.
- Бот и API работают **только пока запущен процесс на вашем ПК** и открыт туннель (или другой способ доступа к `localhost:8000`).

## Планировщик (бэкенд)

- Ежедневно в **03:00 (МСК)** — удаление заказов старше **30 дней**.
- **1-го числа в 12:00 (МСК)** — отчёт в Telegram за **прошлый календарный месяц**.

## Разработка фронтенда

```powershell
cd frontend
npm install
$env:NEXT_PUBLIC_API_URL="http://127.0.0.1:8000"
npm run dev
```

Для локальной проверки без подпути задайте `NEXT_PUBLIC_BASE_PATH` пустым (по умолчанию).

## Лицензия

Проект для внутреннего использования AvantaPrint.
