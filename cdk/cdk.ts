import * as cdk from "aws-cdk-lib"
import { K6EcsStack } from './stack/k6';

const app = new cdk.App();
new K6EcsStack(app, 'K6EcsStack', "scenario1");
