@echo off
setlocal

:: Define the tracker file
set "LAST_RUN_FILE=last_run.txt"

:: Get today's date and time in a standard format using PowerShell
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "Get-Date -Format 'yyyy-MM-dd'"`) do set "TODAY=%%i"
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "Get-Date -Format 'HH:mm:ss'"`) do set "NOW=%%i"

:: Initialize LAST_RUN_DATE
set "LAST_RUN_DATE=none"
:: Check if the tracker file exists and read its content
if exist "%LAST_RUN_FILE%" (
    for /f "usebackq delims=" %%i in ("%LAST_RUN_FILE%") do set "LAST_RUN_DATE=%%i"
)
:: Trim potential trailing spaces from LAST_RUN_DATE (happens if echo was done with space)
for /f "tokens=1" %%a in ("%LAST_RUN_DATE%") do set "LAST_RUN_DATE=%%a"

:: Compare dates - allow bypass with "force" argument
if "%1"=="force" goto start_scrape
if "%TODAY%" == "%LAST_RUN_DATE%" (
    echo [INFO] Scraper already ran today (%TODAY%). Skipping...
    echo [INFO] Use "startup_scraper.bat force" to run anyway.
    timeout /t 5
    exit /b
)

:start_scrape
echo [INFO] Starting daily scrape for %TODAY% at %NOW%...

:: Ensure dependencies are met
python --version >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Python not found! Please install Python.
    pause
    exit /b 1
)

python scraper.py
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Scraper failed with exit code %ERRORLEVEL%!
    echo [INFO] Data might be partially saved. Check data.json.
    pause
    exit /b %ERRORLEVEL%
)

:: Refresh date and time for the commit message after a long scrape
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "Get-Date -Format 'yyyy-MM-dd'"`) do set "COMMIT_DATE=%%i"
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "Get-Date -Format 'HH:mm:ss'"`) do set "COMMIT_TIME=%%i"

echo [INFO] Committing and pushing changes to Git...
:: Set remote just in case
git remote set-url origin https://github.com/ranehal/LeBuTracker1.git

:: Add ONLY data files by default to avoid accidental commits of UI experiments
git add data.json data.js categories.js categories.json

:: Check if there are any changes staged
git diff --cached --quiet
if %ERRORLEVEL% equ 0 (
    echo [INFO] No new data to commit.
) else (
    echo [INFO] Data changes detected. Committing...
    git commit -m "Auto-update scraped data: %COMMIT_DATE% %COMMIT_TIME%"
    echo [INFO] Pushing to GitHub...
    git push origin main
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] Git push failed! If this is a conflict, try "git pull origin main --rebase" manually.
        pause
        exit /b %ERRORLEVEL%
    )
)

:: Update the tracker file
echo %TODAY%>"%LAST_RUN_FILE%"
echo [INFO] Daily scrape and push completed successfully for %TODAY% at %NOW%.
timeout /t 10
