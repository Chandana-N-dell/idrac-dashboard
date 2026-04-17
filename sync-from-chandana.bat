@echo off
echo Syncing changes from Chandana's repository...
echo.

echo Step 1: Fetching latest changes from Chandana's repository...
git fetch upstream
if %errorlevel% neq 0 (
    echo Error: Failed to fetch from upstream
    pause
    exit /b 1
)

echo Step 2: Switching to main branch...
git checkout main
if %errorlevel% neq 0 (
    echo Error: Failed to checkout main branch
    pause
    exit /b 1
)

echo Step 3: Merging Chandana's changes into your local repository...
git merge upstream/main
if %errorlevel% neq 0 (
    echo Error: Failed to merge changes
    echo You may need to resolve conflicts manually
    pause
    exit /b 1
)

echo Step 4: Pushing merged changes to your fork...
git push origin main
if %errorlevel% neq 0 (
    echo Error: Failed to push to your fork
    pause
    exit /b 1
)

echo.
echo Sync completed successfully!
echo Chandana's latest changes are now in your repository.
echo.
pause
