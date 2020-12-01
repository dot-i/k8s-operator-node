/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/ban-types */
/*
 * REMOVE THIS FIXED watch() AGAIN AFTER UPGRADE TO NEWER @kubernetes/client-node!
*/
import * as byline from 'byline';
import * as request from 'request';
import { DefaultRequest, KubeConfig, RequestInterface } from '@kubernetes/client-node';

export class ForeverWatch {
    public static SERVER_SIDE_CLOSE: object = { error: 'Connection closed on server' };
    public config: KubeConfig;
    private readonly requestImpl: RequestInterface;

    public constructor(config: KubeConfig, requestImpl?: RequestInterface) {
        this.config = config;
        if (requestImpl) {
            this.requestImpl = requestImpl;
        } else {
            this.requestImpl = new DefaultRequest();
        }
    }

    public async watch(
        path: string,
        queryParams: any,
        callback: (phase: string, apiObj: any, watchObj?: any) => void,
        done: (err: any) => void,
    ): Promise<any> {
        const cluster = this.config.getCurrentCluster();
        if (!cluster) {
            throw new Error('No currently active cluster');
        }
        const url = cluster.server + path;

        queryParams.watch = true;
        const headerParams: any = {};

        const requestOptions: request.Options = {
            method: 'GET',
            qs: queryParams,
            headers: headerParams,
            uri: url,
            useQuerystring: true,
            json: true,
            forever: true,
            timeout: 0,
        };
        await this.config.applyToRequest(requestOptions);

        const stream = byline.createStream();
        stream.on('data', (line) => {
            try {
                const data = JSON.parse(line);
                callback(data.type, data.object, data);
            } catch (ignore) {
                // ignore parse errors
            }
        });
        let errOut: Error | null = null;
        stream.on('error', (err) => {
            errOut = err;
            done(err);
        });
        stream.on('close', () => done(errOut));

        const req = this.requestImpl.webRequest(requestOptions, (error, response) => {
            if (error) {
                done(error);
            } else if (response && response.statusCode !== 200) {
                done(new Error(response.statusMessage));
            } else {
                done(null);
            }
        });
        req.pipe(stream);
        return req;
    }
}
