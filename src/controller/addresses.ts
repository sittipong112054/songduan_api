import { Router as _R } from "express";
import { conn as _conn } from "../lib/db";
import { asyncHandler } from "../middleware/asyncHandler";
import { validateLatLng } from "../utils/geo";

const aRouter = _R();
export default aRouter;

// สร้างที่อยู่ให้ userId
// POST /users/:userId/addresses  (mount ใน usersRouter ด้านล่างด้วย)
export const createAddressHandler = asyncHandler(async (req, res) => {
    const userId = Number(req.params.userId);
    const { label, address_text, lat, lng, is_default } = req.body || {};
    if (!address_text)
        return res
            .status(400)
            .json({ error: { code: "MISSING", message: "ต้องมี address_text" } });
    const { lat: _lat, lng: _lng } = validateLatLng(lat, lng);

    // ใช้ทรานแซคชันเพื่อรักษา default เพียงรายการเดียว
    const conn = await _conn.getConnection();
    try {
        await conn.beginTransaction();

        if (is_default) {
            // เคลียร์ default เดิม (set default_flag=NULL, is_default=0)
            await conn.execute(
                `UPDATE addresses SET is_default=0, default_flag=NULL WHERE user_id=? AND is_default=1`,
                [userId]
            );
        }

        const [r] = await conn.execute(
            `INSERT INTO addresses(user_id, label, address_text, geo, lat, lng, is_default, default_flag)
       VALUES(?,?,?,?,POINT(?,?),?,?,?)`,
            [
                userId,
                label || null,
                address_text,
                _lat /* placeholder for geo? will use POINT below */,
                _lng,
                _lng,
                _lat,
                is_default ? 1 : 0,
                is_default ? 1 : null,
            ]
        );
        // NOTE: mysql2 จะ map ตามลำดับ values; เราใช้ POINT(?,?) ด้วยค่า (lng, lat)

        const id = (r as any).insertId;
        await conn.commit();

        const [rows] = await _conn.query(
            `SELECT id, user_id, label, address_text, lat, lng, is_default, created_at FROM addresses WHERE id=?`,
            [id]
        );
        res.status(201).json((rows as any)[0]);
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
});

// อ่านที่อยู่ทั้งหมดของผู้ใช้
export const listAddressesHandler = asyncHandler(async (req, res) => {
    const userId = Number(req.params.userId);
    const [rows] = await _conn.query(
        `SELECT id, user_id, label, address_text, lat, lng, is_default, created_at FROM addresses WHERE user_id=? ORDER BY is_default DESC, id DESC`,
        [userId]
    );
    res.json(rows);
});

// เปลี่ยน default address
export const setDefaultAddressHandler = asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    // หา user_id จาก address ก่อน
    const [r0] = await _conn.query(
        `SELECT id, user_id FROM addresses WHERE id=?`,
        [id]
    );
    const adr = (r0 as any)[0];
    if (!adr)
        return res
            .status(404)
            .json({ error: { code: "NOT_FOUND", message: "ไม่พบที่อยู่" } });

    const conn = await _conn.getConnection();
    try {
        await conn.beginTransaction();
        await conn.execute(
            `UPDATE addresses SET is_default=0, default_flag=NULL WHERE user_id=? AND is_default=1`,
            [adr.user_id]
        );
        await conn.execute(
            `UPDATE addresses SET is_default=1, default_flag=1 WHERE id=?`,
            [id]
        );
        await conn.commit();
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }

    const [rows] = await _conn.query(
        `SELECT id, user_id, label, address_text, lat, lng, is_default FROM addresses WHERE id=?`,
        [id]
    );
    res.json((rows as any)[0]);
});

// อัปเดตที่อยู่ (รวมแก้พิกัด)
aRouter.patch(
    "/:id",
    asyncHandler(async (req, res) => {
        const id = Number(req.params.id);
        const { label, address_text, lat, lng, is_default } = req.body || {};

        const conn = await _conn.getConnection();
        try {
            await conn.beginTransaction();

            // ถ้ามีพิกัดใหม่ ตรวจสอบและอัปเดต geo
            let latlngSql = "";
            const binds: any[] = [];
            if (lat != null && lng != null) {
                const { lat: _lat, lng: _lng } = validateLatLng(lat, lng);
                latlngSql = ", geo=POINT(?,?), lat=?, lng=?";
                binds.push(_lng, _lat, _lat, _lng); // geo ใช้ (lng, lat)
            }

            if (is_default === 1 || is_default === true) {
                // หา user ก่อนเพื่อเคลียร์ default ของรายอื่นๆ
                const [r0] = await conn.query(
                    `SELECT user_id FROM addresses WHERE id=?`,
                    [id]
                );
                const row0 = (r0 as any)[0];
                if (!row0) {
                    throw Object.assign(new Error("ไม่พบที่อยู่"), {
                        status: 404,
                        code: "NOT_FOUND",
                    });
                }
                await conn.execute(
                    `UPDATE addresses SET is_default=0, default_flag=NULL WHERE user_id=? AND is_default=1`,
                    [row0.user_id]
                );
            }

            const sql = `UPDATE addresses SET
                   label=COALESCE(?, label),
                   address_text=COALESCE(?, address_text)
                   ${latlngSql}
                   ${is_default == null ? "" : ", is_default=?, default_flag=?"}
                 WHERE id=?`;

            const params = [label ?? null, address_text ?? null, ...binds];
            if (is_default != null) {
                params.push(is_default ? 1 : 0, is_default ? 1 : null);
            }
            params.push(id);

            await conn.execute(sql, params);
            await conn.commit();
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }

        const [rows] = await _conn.query(
            `SELECT id, user_id, label, address_text, lat, lng, is_default, created_at FROM addresses WHERE id=?`,
            [id]
        );
        if ((rows as any).length === 0)
            return res
                .status(404)
                .json({ error: { code: "NOT_FOUND", message: "ไม่พบที่อยู่" } });
        res.json((rows as any)[0]);
    })
);

// ลบที่อยู่
aRouter.delete(
    "/:id",
    asyncHandler(async (req, res) => {
        const [r] = await _conn.execute(`DELETE FROM addresses WHERE id=?`, [
            req.params.id,
        ]);
        if ((r as any).affectedRows === 0)
            return res
                .status(404)
                .json({ error: { code: "NOT_FOUND", message: "ไม่พบที่อยู่" } });
        res.status(204).end();
    })
);

// อ่านที่อยู่เดี่ยว

aRouter.get(
    "/:id",
    asyncHandler(async (req, res) => {
        const [rows] = await _conn.query(
            `SELECT id, user_id, label, address_text, lat, lng, is_default, created_at FROM addresses WHERE id=?`,
            [req.params.id]
        );
        if ((rows as any).length === 0)
            return res
                .status(404)
                .json({ error: { code: "NOT_FOUND", message: "ไม่พบที่อยู่" } });
        res.json((rows as any)[0]);
    })
);

import { Router as __UR } from "express";
export const userAddressesRouter = __UR();
userAddressesRouter.post("/:userId/addresses", createAddressHandler);
userAddressesRouter.get("/:userId/addresses", listAddressesHandler);
