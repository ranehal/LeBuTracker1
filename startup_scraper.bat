@echo off
setlocal

:: Define the tracker file
set "LAST_RUN_FILE=last_run.txt"

:: Get today's date and time in a standard format using PowerShell
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "Get-Date -Format 'yyyy-MM-dd'"`) do set "TODAY=%%i"
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "Get-Date -Format 'HH:mm:ss'"`) do set "NOW=%%i"

:: Check if the tracker file exists and read its content
if exist "%LAST_RUN_FILE%" (
    for /f "usebackq delims=" %%i in ("%LAST_RUN_FILE%") do set "LAST_RUN_DATE=%%i"
) else (
    set "LAST_RUN_DATE=none"
)

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
    pause
    exit /b %ERRORLEVEL%
)

echo [INFO] Committing and pushing changes to Git...
:: Set remote just in case
git remote set-url origin https://github.com/ranehal/LeBuTracker1.git

:: Add all relevant files
git add data.json data.js categories.js categories.json index.html script.js scraper.py startup_scraper.bat

:: Check if there are any changes staged
git diff --cached --quiet
if %ERRORLEVEL% equ 0 (
    echo [INFO] No changes to commit.
) else (
    echo [INFO] Changes detected. Committing...
    git commit -m "Auto-update scraped data: %TODAY% %NOW%"
    echo [INFO] Pushing to GitHub...
    git push --force origin main
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] Git push failed! Check your internet connection and permissions.
        pause
        exit /b %ERRORLEVEL%
    )
)

:: Update the tracker file
echo %TODAY% > "%LAST_RUN_FILE%"
echo [INFO] Daily scrape and push completed successfully for %TODAY% at %NOW%.
timeout /t 10
