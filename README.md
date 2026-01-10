# VortexCode - AI Code Analysis Tool

🚀 **[Try it live here!](https://vortexcode.pages.dev)**

## Assignment Requirements ✅

This project demonstrates:
- ✅ **LLM Usage**: Uses Cloudflare Workers AI (Llama 3.3) to analyze code and detect bugs
- ✅ **Cloudflare Workflow**: Runs code execution followed by AI analysis in sequence
- ✅ **User Input**: Accepts code from users through Monaco Editor
- ✅ **Memory/State**: Stores sessions in D1 database and manages state with Durable Objects

## What It Does

Write code in any language (Python, C++, Java, JavaScript) and click "Analyze with AI". The system:
1. Runs your code and captures the output
2. Sends the code and results to AI
3. AI figures out what your code is trying to do
4. AI checks if it's working correctly
5. AI gives you suggestions if something's wrong

## Quick Start

**Try the live demo**: https://vortexcode.pages.dev

**Run locally**:
```bash
git clone https://github.com/SidReddy21/CloudflareTesting.git
cd CloudflareProject
npm install

# Start backend
npx wrangler dev

# In another terminal, start frontend
cd frontend
npm install
npm run dev
```

**Deploy to Cloudflare**:
```bash
# Deploy backend
npx wrangler deploy

# Deploy frontend
cd frontend
npm run build
npx wrangler pages deploy dist
```

## How It Works

```
User writes code → Execute code (Piston API) → AI analyzes results → Display suggestions
```

## Tech Stack

- **Frontend**: React + Monaco Editor
- **Backend**: Cloudflare Workers + Workers AI (Llama 3.3)
- **Database**: D1 SQLite
- **Code Execution**: Piston API
- **State Management**: Durable Objects

## Project Structure

```
backend/src/
   ├── index.ts          # API routes
   ├── ai.ts             # AI analysis with goal detection
   ├── execute.ts        # Code execution via Piston
   └── SessionManager.ts # Session state management

frontend/src/
   ├── App.tsx           # Main app
   ├── components/       # React components
   └── store/            # State management
```

## Configuration

The project needs:
- Cloudflare Workers AI binding
- D1 database for sessions
- SESSION_TOKEN secret for auth

See `wrangler.toml` for configuration details.

## Testing Examples

**Broken Average Calculator (Python)**:
```python
numbers = [10, 20, 30]
total = sum(numbers)
print(total)  # Should divide by len(numbers)!
```
Expected: AI detects you're trying to calculate average but missing division

**Bubble Sort (C++)**:
```cpp
#include <iostream>
using namespace std;

int main() {
      int arr[] = {64, 34, 25, 12, 22};
      int n = 5;
      for(int i = 0; i < n-1; i++) {
            for(int j = 0; j < n-i-1; j++) {
                  if(arr[j] > arr[j+1]) {
                        swap(arr[j], arr[j+1]);
                  }
            }
      }
      for(int i = 0; i < n; i++)
            cout << arr[i] << " ";
      return 0;
}
```
Expected: AI detects sorting goal and confirms it works correctly

## Requirements

- Node.js 18+
- Cloudflare account
- Wrangler CLI

## Notes

- AI uses Cloudflare's Llama 3.3 model for code analysis
- Supports Python, C++, Java, JavaScript, and more
- Goal-oriented analysis: AI figures out what your code is trying to do
- Session data persists in D1 database
