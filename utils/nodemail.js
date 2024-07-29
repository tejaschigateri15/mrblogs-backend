import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
    }
});

const htmlbody = (token) => {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Reset Your MR BLOGS Password</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;600&display=swap');
        body, html {
            font-family: 'Poppins', sans-serif;
            margin: 0;
            padding: 0;
            background-color: #f4f4f4;
        }
        .container {
            max-width: 600px;
            margin: 20px auto;
            background-color: #ffffff;
            border-radius: 15px;
            overflow: hidden;
            box-shadow: 0 4px 15px rgba(0,0,0,0.1);
        }
        .header {
            background-color: #3498db;
            color: #ffffff;
            padding: 30px;
            text-align: center;
        }
        .logo {
            font-size: 28px;
            font-weight: 600;
            margin-bottom: 10px;
        }
        .content {
            padding: 30px;
            color: #333333;
        }
        h1 {
            color: #2c3e50;
            font-size: 24px;
            margin-bottom: 20px;
        }
        p {
            line-height: 1.6;
            margin-bottom: 20px;
        }
        .btn {
            display: inline-block;
            background-color: #3498db;
            color: #ffffff;
            text-decoration: none;
            padding: 12px 25px;
            border-radius: 5px;
            font-weight: 600;
            transition: background-color 0.3s ease;
        }
        .btn:hover {
            background-color: #2980b9;
        }
        .footer {
            background-color: #34495e;
            color: #ffffff;
            text-align: center;
            padding: 20px;
            font-size: 14px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">MR BLOGS</div>
            <p>Your Blogging Adventure Awaits!</p>
        </div>
        <div class="content">
            <h1>Reset Your Password</h1>
            <p>Hello there!</p>
            <p>We received a request to reset your password for MR BLOGS. Don't worry, we've got you covered! Click the button below to set a new password and get back to sharing your amazing stories with the world.</p>
            <p>
                <a href="http://localhost:5173/reset-password?token=${token}" class="btn">Reset My Password</a>
            </p>
            <p>If you didn't request this password reset, you can safely ignore this email. Your account is still secure.</p>
            <p>Happy blogging!</p>
        </div>
        <div class="footer">
            &copy; 2024 MR BLOGS. All rights reserved.
        </div>
    </div>
</body>
</html>
    `;
    return html;
}

async function sendEmail({ to, subject, token }) {
    try {
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: to,
            subject: subject,
            html: htmlbody(token),
        };

        const info = await transporter.sendMail(mailOptions);
        console.log('Message sent: %s', info.messageId);
        return info;
    } catch (error) {
        console.error('Error sending email:', error);
        throw error;
    }
}

export default sendEmail;