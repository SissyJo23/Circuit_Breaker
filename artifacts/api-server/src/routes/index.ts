import { Router, type IRouter } from "express";
import healthRouter from "./health";
import riskEvaluationsRouter from "./risk-evaluations";

const router: IRouter = Router();

router.use(healthRouter);
router.use(riskEvaluationsRouter);

export default router;
