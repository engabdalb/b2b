<?php
declare(strict_types=1);

/** @return array{id:int, email:string, display_name:string, role:string, dealer_id:?string} */
function b2b_require_auth(): array
{
    $a = $GLOBALS['b2b_auth'] ?? null;
    if (!is_array($a)) {
        json_response(['ok' => false, 'message' => 'Unauthorized'], 401);
    }
    return $a;
}
