"""Bounded, fail-closed handling of an observed face that can no longer be located.

An empty detector result is not evidence that a person has left the frame.
This does not claim to detect faces that the model never observed.
"""
POLICY = 'coverage-guard-v3'
MAX_HOLD_SECONDS = .65


def check_gap(last, now):
    if now - last > MAX_HOLD_SECONDS + 1e-6:
        raise RuntimeError(
            f'FACE_TRACK_LOST：同一镜头内 {last:.2f}–{now:.2f} 秒无法持续确认人脸位置，'
            '已停止该素材，未生成可能漏遮挡的成片。请检查此处是否快速移动、遮挡或离场，'
            '调整素材后重试。')


def protected_box(previous, predicted, age):
    """Union observed/predicted positions and add uncertainty, in any coordinate unit."""
    left = min(previous[0], predicted[0])
    top = min(previous[1], predicted[1])
    right = max(previous[0] + previous[2], predicted[0] + predicted[2])
    bottom = max(previous[1] + previous[3], predicted[1] + predicted[3])
    margin = .12 + .25 * min(1., max(0., age) / MAX_HOLD_SECONDS)
    dx = max(previous[2], predicted[2]) * margin
    dy = max(previous[3], predicted[3]) * margin
    return [float(x) for x in (left-dx, top-dy, right-left+2*dx, bottom-top+2*dy)]
