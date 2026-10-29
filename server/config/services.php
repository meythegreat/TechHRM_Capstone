<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    'n8n' => [
        // Forgot-password mail is sent here. Resend is not used for resets.
        'forgot_password_webhook' => env(
            'N8N_FORGOT_PASSWORD_WEBHOOK',
            'http://localhost:5678/webhook/techhrm/forgot-password'
        ),
        // Application submission and status emails. Same Gmail workflow host as password reset.
        'application_status_webhook' => env(
            'N8N_APPLICATION_STATUS_WEBHOOK',
            'https://techhrm-n8n.onrender.com/webhook/techhrm/application-submitted'
        ),
    ],

];
