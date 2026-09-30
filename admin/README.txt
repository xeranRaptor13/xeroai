XeroAI Trading Connections — clean package

This package is intentionally compact. It contains only the files needed for the Trading Connections feature:

trading.html
  Your existing trading page, with the Deriv App ID/API token handoff added directly inside the page.

admin/trading-connections.html
  The new admin Trading Connections page. Its feature-specific CSS and JavaScript are embedded in this single file, so no extra admin CSS/JS files are required.

firestore.rules
  Updated rules adding users/{userId}/brokerConnections/{connectionId}.

INSTALL
1. Replace your current root trading.html with this trading.html.
2. Put admin/trading-connections.html inside your existing admin/ folder.
3. Add a Trading Connections link to your existing admin navigation pointing to trading-connections.html.
4. Deploy firestore.rules in Firebase Console.
5. Do not modify the Python trading bot.

IMPORTANT
API tokens are trading credentials. Test first with a safe test credential. Do not paste a real token into ChatGPT.
