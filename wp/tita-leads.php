<?php
/**
 * Plugin Name: Tita Leads
 * Description: Recibe los leads del formulario de contacto del sitio, los guarda en MySQL y los envía a HubSpot.
 * Version: 1.0.0
 *
 * Instalación: UNA sola copia, en wp-content/plugins/wp/tita-leads.php (como hoy en producción) o en
 * wp-content/mu-plugins/tita-leads.php, nunca en las dos (PHP: Cannot redeclare tita_leads_conf()).
 * Actualizar con deploy/install-leads-plugin.sh, que detecta dónde está.
 *
 * Configuración (wp-config.php o variables de entorno; nunca en este archivo):
 *   TITA_HUBSPOT_TOKEN      Private App token de HubSpot (scope: forms)
 *   TITA_HUBSPOT_PORTAL_ID  ID de la cuenta de HubSpot
 *   TITA_HUBSPOT_FORM_GUID  GUID del formulario "no-HubSpot" que recibe los envíos
 * Opcional (reCAPTCHA v3; si TITA_RECAPTCHA_SECRET no está definida, la verificación queda desactivada):
 *   TITA_RECAPTCHA_SECRET     secret key de reCAPTCHA v3 (la site key va en js/contact-form.js)
 *   TITA_RECAPTCHA_MIN_SCORE  umbral 0-1 (por defecto 0.5)
 * Opcional:
 *   TITA_LEADS_ALLOWED_ORIGINS  array de orígenes permitidos para CORS
 *   TITA_LEADS_TRUSTED_IP_HEADER  p. ej. 'HTTP_CF_CONNECTING_IP' si WP está detrás de Cloudflare
 */
defined('ABSPATH') || exit;

const TITA_LEADS_DB_VERSION = '1';
const TITA_LEADS_MAX_ATTEMPTS = 5;
const TITA_LEADS_RATE_LIMIT = 5;        // envíos por hora por IP
const TITA_LEADS_MAX_BODY = 20000;      // bytes

function tita_leads_conf($key) {
    if (defined($key)) return constant($key);
    $v = getenv($key);
    return $v === false ? '' : $v;
}

function tita_leads_table() {
    global $wpdb;
    return $wpdb->prefix . 'tita_leads';
}

/* ---------- Tabla ---------- */

add_action('init', function () {
    if (get_option('tita_leads_db_version') === TITA_LEADS_DB_VERSION) return;
    global $wpdb;
    require_once ABSPATH . 'wp-admin/includes/upgrade.php';
    $t = tita_leads_table();
    $charset = $wpdb->get_charset_collate();
    dbDelta("CREATE TABLE $t (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      created_at DATETIME NOT NULL,
      name VARCHAR(190) NOT NULL,
      company VARCHAR(190) NOT NULL DEFAULT '',
      role VARCHAR(190) NOT NULL DEFAULT '',
      email VARCHAR(190) NOT NULL,
      country VARCHAR(100) NOT NULL DEFAULT '',
      source VARCHAR(100) NOT NULL DEFAULT '',
      needs TEXT NULL,
      message TEXT NOT NULL,
      page_url VARCHAR(500) NOT NULL DEFAULT '',
      utm TEXT NULL,
      hutk VARCHAR(64) NOT NULL DEFAULT '',
      ip_hash CHAR(64) NOT NULL DEFAULT '',
      consent_at DATETIME NOT NULL,
      hubspot_status VARCHAR(10) NOT NULL DEFAULT 'pending',
      hubspot_attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
      hubspot_error VARCHAR(500) NOT NULL DEFAULT '',
      hubspot_sent_at DATETIME NULL,
      PRIMARY KEY  (id),
      KEY hubspot_status (hubspot_status),
      KEY created_at (created_at)
    ) $charset;");
    update_option('tita_leads_db_version', TITA_LEADS_DB_VERSION);
});

/* ---------- CORS (solo para /tita/v1/*) ---------- */

function tita_leads_allowed_origins() {
    if (defined('TITA_LEADS_ALLOWED_ORIGINS')) return TITA_LEADS_ALLOWED_ORIGINS;
    $o = ['https://titamedia.com', 'https://www.titamedia.com'];
    if (wp_get_environment_type() !== 'production') $o[] = 'http://localhost:5173';
    return $o;
}

add_filter('rest_pre_serve_request', function ($served, $result, $request) {
    if (strpos($request->get_route(), '/tita/v1/') !== 0) return $served;
    remove_filter('rest_pre_serve_request', 'rest_send_cors_headers'); // evita el "*"/eco de origen por defecto
    $origin = get_http_origin();
    if ($origin && in_array($origin, tita_leads_allowed_origins(), true)) {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Access-Control-Allow-Methods: POST, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type');
        header('Vary: Origin');
    }
    return $served;
}, 5, 3);

/* ---------- Endpoint ---------- */

add_action('rest_api_init', function () {
    register_rest_route('tita/v1', '/leads', [
        'methods'             => 'POST',
        'callback'            => 'tita_leads_handle',
        'permission_callback' => '__return_true', // endpoint público; se protege con honeypot + rate limit + validación
    ]);
});

function tita_leads_client_ip() {
    $h = tita_leads_conf('TITA_LEADS_TRUSTED_IP_HEADER');
    $ip = ($h && !empty($_SERVER[$h])) ? $_SERVER[$h] : ($_SERVER['REMOTE_ADDR'] ?? '');
    return filter_var($ip, FILTER_VALIDATE_IP) ? $ip : '0.0.0.0';
}

/**
 * reCAPTCHA v3. Devuelve true si pasa o está desactivado; false si el token falta o es inválido/bajo.
 * Si Google no responde (error de red) se deja pasar y se registra: el honeypot y el rate limit siguen activos.
 */
function tita_leads_recaptcha_ok($token, $ip) {
    $secret = tita_leads_conf('TITA_RECAPTCHA_SECRET');
    if (!$secret) return true;
    if (!is_string($token) || $token === '' || strlen($token) > 4096) return false;
    $res = wp_remote_post('https://www.google.com/recaptcha/api/siteverify', [
        'timeout' => 5,
        'body' => ['secret' => $secret, 'response' => $token, 'remoteip' => $ip],
    ]);
    if (is_wp_error($res) || wp_remote_retrieve_response_code($res) !== 200) {
        error_log('tita-leads: reCAPTCHA no disponible, se omite verificación');
        return true;
    }
    $d = json_decode(wp_remote_retrieve_body($res), true);
    if (!is_array($d) || empty($d['success'])) return false;
    if (($d['action'] ?? '') !== 'lead') return false;
    if (!in_array($d['hostname'] ?? '', ['titamedia.com', 'www.titamedia.com'], true)) return false;
    $min = (float) (tita_leads_conf('TITA_RECAPTCHA_MIN_SCORE') ?: 0.5);
    return (float) ($d['score'] ?? 0) >= $min;
}

function tita_leads_text($v, $max) {
    return mb_substr(sanitize_text_field(is_string($v) ? $v : ''), 0, $max);
}

function tita_leads_handle(WP_REST_Request $req) {
    if (strlen($req->get_body()) > TITA_LEADS_MAX_BODY) {
        return new WP_Error('too_large', 'Solicitud demasiado grande', ['status' => 413]);
    }
    $p = $req->get_json_params();
    if (!is_array($p)) return new WP_Error('bad_request', 'Solicitud inválida', ['status' => 400]);

    // Honeypot: responder OK sin guardar para no dar señal al bot.
    if (!empty($p['website'])) return new WP_REST_Response(['ok' => true], 200);

    // Rate limit por IP.
    $ip = tita_leads_client_ip();
    $rl = 'tita_lead_rl_' . md5($ip);
    $n = (int) get_transient($rl);
    if ($n >= TITA_LEADS_RATE_LIMIT) return new WP_Error('rate_limited', 'Demasiadas solicitudes', ['status' => 429]);
    set_transient($rl, $n + 1, HOUR_IN_SECONDS);

    if (!tita_leads_recaptcha_ok($p['recaptcha_token'] ?? '', $ip)) {
        return new WP_Error('captcha', 'Verificación fallida', ['status' => 403]);
    }

    $email = sanitize_email(is_string($p['email'] ?? null) ? $p['email'] : '');
    $name = tita_leads_text($p['name'] ?? '', 190);
    $message = mb_substr(sanitize_textarea_field(is_string($p['message'] ?? null) ? $p['message'] : ''), 0, 5000);
    if (!$name || !$message || !is_email($email) || empty($p['consent'])) {
        return new WP_Error('invalid', 'Datos incompletos o inválidos', ['status' => 400]);
    }

    $needs = [];
    if (is_array($p['needs'] ?? null)) {
        foreach (array_slice($p['needs'], 0, 6) as $x) $needs[] = tita_leads_text($x, 150);
    }
    $utm = [];
    if (is_array($p['utm'] ?? null)) {
        foreach (['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as $k) {
            if (!empty($p['utm'][$k])) $utm[$k] = tita_leads_text($p['utm'][$k], 150);
        }
    }

    global $wpdb;
    $now = current_time('mysql', true);
    $ok = $wpdb->insert(tita_leads_table(), [
        'created_at' => $now,
        'name'       => $name,
        'company'    => tita_leads_text($p['company'] ?? '', 190),
        'role'       => tita_leads_text($p['role'] ?? '', 190),
        'email'      => $email,
        'country'    => tita_leads_text($p['country'] ?? '', 100),
        'source'     => tita_leads_text($p['source'] ?? '', 100),
        'needs'      => wp_json_encode($needs),
        'message'    => $message,
        'page_url'   => mb_substr(esc_url_raw(is_string($p['page_url'] ?? null) ? $p['page_url'] : ''), 0, 500),
        'utm'        => wp_json_encode($utm),
        'hutk'       => preg_replace('/[^a-f0-9]/i', '', mb_substr((string) ($p['hutk'] ?? ''), 0, 64)),
        'ip_hash'    => hash_hmac('sha256', $ip, wp_salt()),
        'consent_at' => $now,
    ]);
    if (!$ok) {
        error_log('[tita-leads] insert failed: ' . $wpdb->last_error);
        return new WP_Error('server_error', 'No se pudo guardar la solicitud', ['status' => 500]);
    }

    // El lead ya está a salvo en la DB; HubSpot es best-effort (con reintentos por cron).
    tita_leads_sync_hubspot((int) $wpdb->insert_id);
    return new WP_REST_Response(['ok' => true], 200);
}

/* ---------- HubSpot ---------- */

function tita_leads_sync_hubspot($id) {
    global $wpdb;
    $t = tita_leads_table();
    $lead = $wpdb->get_row($wpdb->prepare("SELECT * FROM $t WHERE id = %d", $id), ARRAY_A);
    if (!$lead || $lead['hubspot_status'] === 'sent') return;

    $portal = tita_leads_conf('TITA_HUBSPOT_PORTAL_ID');
    $form   = tita_leads_conf('TITA_HUBSPOT_FORM_GUID');
    $token  = tita_leads_conf('TITA_HUBSPOT_TOKEN');

    $status = 'failed';
    $error = '';
    if (!$portal || !$form || !$token) {
        $error = 'hubspot_not_configured';
    } else {
        $parts = preg_split('/\s+/', trim($lead['name']), 2);
        $map = [
            'firstname'          => $parts[0] ?? '',
            'lastname'           => $parts[1] ?? '',
            'email'              => $lead['email'],
            'company'            => $lead['company'],
            'jobtitle'           => $lead['role'],
            'country'            => $lead['country'],
            'como_nos_conociste' => $lead['source'],
            'necesidad'          => implode(';', (array) json_decode($lead['needs'] ?: '[]', true)),
            'message'            => $lead['message'],
        ];
        $fields = [];
        foreach ($map as $k => $v) if ($v !== '') $fields[] = ['objectTypeId' => '0-1', 'name' => $k, 'value' => $v];

        $ctx = ['pageUri' => $lead['page_url'], 'pageName' => 'Contacto Tita Media'];
        if ($lead['hutk']) $ctx['hutk'] = $lead['hutk'];

        $res = wp_remote_post(
            'https://api.hsforms.com/submissions/v3/integration/secure/submit/' . rawurlencode($portal) . '/' . rawurlencode($form),
            [
                'timeout' => 6,
                'headers' => ['Content-Type' => 'application/json', 'Authorization' => 'Bearer ' . $token],
                'body'    => wp_json_encode([
                    'fields'  => $fields,
                    'context' => $ctx,
                    'legalConsentOptions' => ['consent' => [
                        'consentToProcess' => true,
                        'text' => 'Autorizo el tratamiento de mis datos personales para que Tita Media me contacte sobre esta solicitud.',
                    ]],
                ]),
            ]
        );
        if (is_wp_error($res)) {
            $error = $res->get_error_message();
        } elseif (wp_remote_retrieve_response_code($res) === 200) {
            $status = 'sent';
        } else {
            $error = 'HTTP ' . wp_remote_retrieve_response_code($res) . ': ' . wp_remote_retrieve_body($res);
        }
    }

    $wpdb->update($t, [
        'hubspot_status'   => $status,
        'hubspot_attempts' => (int) $lead['hubspot_attempts'] + 1,
        'hubspot_error'    => mb_substr($error, 0, 500),
        'hubspot_sent_at'  => $status === 'sent' ? current_time('mysql', true) : null,
    ], ['id' => $id]);
    if ($status === 'failed') error_log('[tita-leads] hubspot failed for lead ' . $id . ': ' . mb_substr($error, 0, 200));
}

/* ---------- Reintentos (cada 15 min, máx. 5 intentos) ---------- */

add_filter('cron_schedules', function ($s) {
    $s['tita_leads_15min'] = ['interval' => 900, 'display' => 'Cada 15 minutos'];
    return $s;
});

add_action('init', function () {
    if (!wp_next_scheduled('tita_leads_retry')) wp_schedule_event(time() + 900, 'tita_leads_15min', 'tita_leads_retry');
});

add_action('tita_leads_retry', function () {
    global $wpdb;
    $t = tita_leads_table();
    $ids = $wpdb->get_col($wpdb->prepare(
        "SELECT id FROM $t WHERE hubspot_status IN ('pending','failed') AND hubspot_attempts < %d ORDER BY id ASC LIMIT 20",
        TITA_LEADS_MAX_ATTEMPTS
    ));
    foreach ($ids as $id) tita_leads_sync_hubspot((int) $id);
});
