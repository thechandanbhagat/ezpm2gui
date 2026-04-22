@echo off
echo EZ PM2 GUI Website Switcher
echo.
echo This script helps you switch between the old and new website versions
echo.
echo [1] Activate the revamped website (set as index.html)
echo [2] Restore the original website
echo.
set /p choice="Enter your choice (1 or 2): "

if "%choice%"=="1" (
    echo Backing up original website...
    if exist "index.html" (
        copy "index.html" "index-original.html"
    )
    
    echo Activating new website design...
    copy "index-new.html" "index.html"
    
    echo Done! The revamped website is now active.
) else if "%choice%"=="2" (
    echo Restoring original website...
    if exist "index-original.html" (
        copy "index-original.html" "index.html"
        echo Done! The original website has been restored.
    ) else (
        echo Error: Original website backup not found.
    )
) else (
    echo Invalid choice. Please run the script again and select 1 or 2.
)

echo.
pause
