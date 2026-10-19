import { Router, type IRouter } from "express";
import healthRouter from "./health";
import contentAiRouter from "./content-ai";
import stateRouter from "./state";
import reviewRouter from "./review";
import storageRouter from "./storage";
import launchRouter from "./launch";

const router: IRouter = Router();

router.use(healthRouter);
router.use(contentAiRouter);
router.use(stateRouter);
router.use(reviewRouter);
router.use(storageRouter);
router.use(launchRouter);

export default router;
