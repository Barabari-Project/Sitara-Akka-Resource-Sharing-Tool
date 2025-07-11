import { Router, Request, Response } from 'express';
import { ResourceModel } from '../models/resource.model';
import { ResourceDataEntryModel } from '../models/resourceDataEntry.model';
import { SubDataModel } from '../models/subdata.model';
import { ResourceItemModel } from '../models/resourceItem.model';
import { authMiddleware, UserRoles } from '../middleware/auth.middleware';
import expressAsyncHandler from 'express-async-handler';
import createHttpError from 'http-errors';
import { ExpiringMediaModel } from '../models/expiringMedia.model';
import mongoose from 'mongoose';
import { getFileFromS3, getS3Link, uploadMediaToWhatsApp } from '../utility/awsS3';

export const getRouter = Router();

// GET unique languages
getRouter.get('/resources/languages', expressAsyncHandler(async (req: Request, res: Response) => {
    const languages = await ResourceModel.distinct('lan');
    res.status(200).json({ languages });
}));


// GET unique subjects based on language
getRouter.get('/resources/subjects', expressAsyncHandler(async (req: Request, res: Response) => {
    const { lan } = req.query;
    if (!lan || typeof lan !== 'string') {
        throw createHttpError(400, 'Query param "lan" is required and must be a string.');
    }
    const resources = await ResourceModel.find({ lan }).select('-data -__v');
    res.status(200).json({ resources });
}));


// GET all resource data entries for a given resourceId
getRouter.get('/resource-data-entries/:resourceId', expressAsyncHandler(async (req: Request, res: Response) => {
    const { resourceId } = req.params;
    const entries = await ResourceDataEntryModel.find({ resourceId }).select('-data -__v -resourceId');
    res.status(200).json({ entries });
}));

// GET all subdata entries for a given resourceDataEntryId
getRouter.get('/subdata/:resourceDataEntryId', expressAsyncHandler(async (req: Request, res: Response) => {
    const { resourceDataEntryId } = req.params;
    const subData = await SubDataModel.find({ resourceDataEntryId }).select('-data -__v -resourceDataEntryId -link');
    res.status(200).json({ subData });
}));

getRouter.get('/resource-items/:subDataId', expressAsyncHandler(async (req: Request, res: Response) => {
    const { subDataId } = req.params;
    const items = await ResourceItemModel.find({ subDataId }).select('-subDataId -__v -link');
    res.status(200).json({ items });
}));


// GET resource item link by ID
getRouter.get('/resource-items/link/:id', authMiddleware([UserRoles.ADMIN, UserRoles.USER]), expressAsyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
        throw createHttpError(400, 'Invalid ID');
    }

    const item = await ResourceItemModel.findById(id).select('link');

    if (!item) {
        throw createHttpError(404, 'Resource item not found');
    }

    // const media = await ExpiringMediaModel.findById(id);
    // if( !media ) {
    const link = getS3Link(item.link);
    const file = await getFileFromS3(item.link);
    // }
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${item.name}"`);
    res.send(file);
}));

// GET SubData's data array by SubData ID
getRouter.get('/subdata/link/:id', authMiddleware([UserRoles.ADMIN, UserRoles.USER]), expressAsyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    const subData = await SubDataModel.findById(id).select('link');

    if (!subData || !subData.link) {
        throw createHttpError(404, 'SubData not found');
    }

    // const { stream, contentType, fileName } = await getFileFromS3(subData.link);

    const media = await uploadMediaToWhatsApp(subData.link);

    res.status(200).json({ media });

    // res.setHeader('Content-Type', contentType);
    // res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);

    // stream.pipe(res);
}));