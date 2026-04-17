@echo off
echo Pushing your changes to Chandana's repository...
echo.

echo Step 1: Adding your changes to git...
git add .
if %errorlevel% neq 0 (
    echo Error: Failed to add changes
    pause
    exit /b 1
)

echo Step 2: Committing your changes...
set /p commit_msg="Enter commit message (or press Enter for default): "
if "%commit_msg%"=="" set commit_msg=Update fan status and LC logs fixes
git commit -m "%commit_msg%"
if %errorlevel% neq 0 (
    echo Error: Failed to commit changes
    pause
    exit /b 1
)

echo Step 3: Pushing to your GitHub fork...
git push origin main
if %errorlevel% neq 0 (
    echo Error: Failed to push to your fork
    pause
    exit /b 1
)

echo.
echo Changes pushed to your fork successfully!
echo.
echo To share with Chandana, create a pull request at:
echo https://github.com/SR1367130/idrac-dashboard/compare/main...Chandana-N-dell:main
echo.
echo Or visit: https://github.com/SR1367130/idrac-dashboard and click "Contribute"
echo.
pause
