import { Router } from "express";
import { conn as _conn } from "../lib/db";
import { asyncHandler as _async } from "../middleware/asyncHandler";

const router = Router();
export default router;

// สร้าง/อัปเดต โปรไฟล์ไรเดอร์ (upsert แบบง่าย)
router.put(
    "/:userId/profile",
    _async(async (req, res) => {
        const userId = Number(req.params.userId);
        const {
            vehicle_plate,
            vehicle_model,
            vehicle_photo_url,
            rider_photo_url,
            is_active,
        } = req.body || {};
        if (!vehicle_plate)
            return res
                .status(400)
                .json({ error: { code: "MISSING", message: "ต้องมี vehicle_plate" } });

        // ตรวจสอบ role
        const [u] = await _conn.query(`SELECT id, role FROM users WHERE id=?`, [
            userId,
        ]);
        const user = (u as any)[0];
        if (!user)
            return res
                .status(404)
                .json({ error: { code: "USER_NOT_FOUND", message: "ไม่พบผู้ใช้" } });
        if (user.role !== "RIDER")
            return res.status(400).json({
                error: { code: "NOT_RIDER", message: "ผู้ใช้นี้ไม่ใช่ RIDER" },
            });

        try {
            // ใช้ INSERT ... ON DUPLICATE KEY UPDATE (primary key คือ user_id)
            await _conn.execute(
                `INSERT INTO rider_profiles(user_id, vehicle_photo_url, vehicle_plate, vehicle_model, rider_photo_url, is_active)
       VALUES(?,?,?,?,?, COALESCE(?,1))
       ON DUPLICATE KEY UPDATE
         vehicle_photo_url=VALUES(vehicle_photo_url),
         vehicle_plate=VALUES(vehicle_plate),
         vehicle_model=VALUES(vehicle_model),
         rider_photo_url=VALUES(rider_photo_url),
         is_active=COALESCE(VALUES(is_active), is_active)`,
                [
                    userId,
                    vehicle_photo_url || null,
                    vehicle_plate,
                    vehicle_model || null,
                    rider_photo_url || null,
                    is_active,
                ]
            );
        } catch (err: any) {
            if (err?.code === "ER_DUP_ENTRY") {
                return res.status(409).json({
                    error: { code: "PLATE_TAKEN", message: "ทะเบียนรถนี้ถูกใช้แล้ว" },
                });
            }
            throw err;
        }

        const [rows] = await _conn.query(
            `SELECT * FROM rider_profiles WHERE user_id=?`,
            [userId]
        );
        res.json((rows as any)[0]);
    })
);

router.get(
    "/:userId/profile",
    _async(async (req, res) => {
        const [rows] = await _conn.query(
            `SELECT * FROM rider_profiles WHERE user_id=?`,
            [req.params.userId]
        );
        if ((rows as any).length === 0)
            return res
                .status(404)
                .json({ error: { code: "NOT_FOUND", message: "ไม่พบโปรไฟล์ไรเดอร์" } });
        res.json((rows as any)[0]);
    })
);

router.patch(
    "/:userId/activate",
    _async(async (req, res) => {
        await _conn.execute(
            `UPDATE rider_profiles SET is_active=1 WHERE user_id=?`,
            [req.params.userId]
        );
        const [rows] = await _conn.query(
            `SELECT * FROM rider_profiles WHERE user_id=?`,
            [req.params.userId]
        );
        res.json((rows as any)[0]);
    })
);

router.patch(
    "/:userId/deactivate",
    _async(async (req, res) => {
        await _conn.execute(
            `UPDATE rider_profiles SET is_active=0 WHERE user_id=?`,
            [req.params.userId]
        );
        const [rows] = await _conn.query(
            `SELECT * FROM rider_profiles WHERE user_id=?`,
            [req.params.userId]
        );
        res.json((rows as any)[0]);
    })
);
